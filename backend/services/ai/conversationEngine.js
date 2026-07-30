import { config } from 'dotenv';
config();

import { db } from '../../config/firebase.js';
import { llm } from './llmAdapter.js';
import { logger } from '../../utils/logger.js';
import { parseDate, formatDate } from './dateParser.js';
import { conversationMemory } from '../memory/conversationMemory.js';
import { memoryService } from '../memory/memoryService.js';
import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { habitService } from '../habits/habitService.js';

// ── IST helpers ────────────────────────────────────────────────────────────
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istNow() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

function istDateStr(date) {
  if (!date) return '';
  const d = new Date(
    (date.toDate ? date.toDate() : new Date(date)).getTime() + IST_OFFSET_MS
  );
  return d.toISOString().slice(0, 10);
}

function isCompletedToday(habit) {
  if (!habit.lastCompleted) return false;
  return istDateStr(habit.lastCompleted) === istDateStr(new Date());
}

// ── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Abhishek's personal chief-of-staff. You run his life like a sharp, proactive operator.

ABOUT ABHISHEK:
- IIM Ahmedabad PGP student (2025-27), Section B CR
- CA qualified (All India 16th in SFM)
- Getting married to Riya on January 24, 2027
- Interested in semiconductors, OSAT, entrepreneurship
- Previously built Special Modules vertical at Waaree Energies
- Prefers Jain food
- Timezone: IST (Asia/Kolkata)

YOUR PERSONALITY:
- Crisp. Never more than 2-3 sentences unless asked for detail.
- Proactive. Don't wait to be asked — flag overdue tasks, spending concerns, missed habits, upcoming deadlines.
- Opinionated. If he's behind on something, say so directly. "You have 3 overdue tasks" not "Would you like me to check your tasks?"
- Personal. Use his name occasionally. Reference his actual schedule and context.
- Never say "How can I assist you?" or "How can I help" or "Is there anything else?" — those are filler. Just handle it.
- If there's nothing to act on, give a quick status or a useful observation.

WHAT YOU CAN DO (emit these in the actions array):
{"type":"create_task","title":"...","deadline_text":"raw date","recurrence_text":"raw recurrence","priority":"high|medium|low"}
{"type":"create_expense","amount":0,"category":"food|travel|shopping|education|health|other","description":"..."}
{"type":"store_memory","key":"...","value":"..."}
{"type":"complete_task","match":"keywords to find task"}
{"type":"delete_task","match":"keywords to find task"}
{"type":"create_habit","name":"...","recurrence":"daily|weekly|weekdays|..."}
{"type":"complete_habit","match":"habit name keyword"}
{"type":"delete_habit","match":"habit name keyword"} — ONE specific habit only. Put the habit's name as the match.
{"type":"delete_all_habits"} — ALL habits at once. NO match field. Use this (not delete_habit) when user says "remove all habits", "delete all habits", "clear all my habits", "delete everything".
{"type":"create_calendar_event","title":"...","date":"raw date/time","end_date":"raw end time","location":"...","description":"..."}
{"type":"ask_followup","waiting_for":"label","partial":{}}

RESPONSE FORMAT — always valid JSON, no other text:
{"reply":"your message to Abhishek","actions":[...]}

RULES:
- Actions can be empty if just chatting or answering a question.
- For tasks: always extract a clear title. Never "Untitled Task."
- Keep deadline_text and date as raw words — the system parses them.
- Match tasks/habits for complete/delete loosely by keywords (use the habit's actual name).
- When answering about tasks/expenses/calendar/habits, use ACTUAL DATA in context. Don't invent.
- Make your best judgment and act — don't over-ask. You're a chief-of-staff, not a waiter.
- When you take an action, ALWAYS confirm specifically what you did — never just "Got it." Examples:
  - Expense: "Logged ₹500 under travel. You're at ₹X of ₹Y travel budget this month."
  - Task: "Added: 'Submit ops report' due Friday [high]."
  - Habit: "Gym habit created, daily. I'll track your streak."
  - Use the spending data already in context to give the budget figure — don't say you can't see it.
- Habits are RECURRING behaviours. Never create_task for a habit.
- CRITICAL: "remove all habits" / "delete all habits" / "clear habits" → always emit delete_all_habits (no match). NEVER emit delete_habit with match="all" or match="all habits" — that only deletes one.
- "remove X habit" / "delete X" (where X is a specific habit name) → emit delete_habit with match="X".
- Use create_calendar_event for meetings, appointments, or any timed event.
- When ACTIVE FOLLOW-UP context is present, the user is answering your question — use that to complete the goal, don't ask again.

HABIT ACTION EXAMPLES:
"remove meditate habit" → {"type":"delete_habit","match":"meditate"}
"remove all habits" → {"type":"delete_all_habits"}
"clear all my habits" → {"type":"delete_all_habits"}
"delete gym" → {"type":"delete_habit","match":"gym"}`;

export class ConversationEngine {
  // ── Session helpers ──────────────────────────────────────────────────────

  async getSession(userId) {
    try {
      const doc = await db.collection('settings').doc(`session_${userId}`).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      logger.error('Failed to read session', { error: error.message });
      return null;
    }
  }

  async setSession(userId, data) {
    try {
      await db.collection('settings').doc(`session_${userId}`).set(data);
    } catch (error) {
      logger.error('Failed to write session', { error: error.message });
    }
  }

  async clearSession(userId) {
    try {
      await db.collection('settings').doc(`session_${userId}`).delete();
    } catch (error) {
      logger.error('Failed to clear session', { error: error.message });
    }
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  async process(userId, chatId, message) {
    const [recentTurns, memories, tasks, expenseSummary, habits, pendingSession,
           calendarContext, activeDoc, journalLines, budgets] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      taskService.getUserTasks(userId, 'pending'),
      expenseService.getMonthlySummary(userId),
      habitService.getUserHabits(userId).catch(() => []),
      this.getSession(userId),
      this.getCalendarContext(userId),
      this.getActiveDocContext(userId),
      this.getJournalLines(userId),
      this.getBudgets(userId)
    ]);

    if (pendingSession) await this.clearSession(userId);

    // ── IST time block ─────────────────────────────────────────────────────
    const now = istNow();
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = now.getUTCHours(), m = now.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const timeBlock = `RIGHT NOW: ${DAY_NAMES[now.getUTCDay()]}, ${now.getUTCDate()} ${MON_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}, ${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm} IST`;
    const todayStr = now.toISOString().slice(0, 10);

    // ── Tasks: split by urgency ────────────────────────────────────────────
    const overdueTasks = tasks.filter(t => t.deadline && istDateStr(t.deadline) < todayStr);
    const dueTodayTasks = tasks.filter(t => t.deadline && istDateStr(t.deadline) === todayStr);
    const upcomingTasks = tasks.filter(t => !t.deadline || istDateStr(t.deadline) > todayStr);

    const taskLines = (arr, label) => arr.length
      ? `${label} (${arr.length}):\n` + arr.map((t, i) =>
          `${i+1}. ${t.title} [${t.priority}]${t.deadline ? ` — due ${formatDate(t.deadline)}` : ''}`
        ).join('\n')
      : '';

    const taskBlock = [
      taskLines(overdueTasks, 'OVERDUE TASKS ❗'),
      taskLines(dueTodayTasks, 'DUE TODAY 📌'),
      taskLines(upcomingTasks, 'UPCOMING TASKS')
    ].filter(Boolean).join('\n\n') || '(no pending tasks)';

    // ── Habits ─────────────────────────────────────────────────────────────
    const habitBlock = habits.length
      ? 'HABITS TODAY:\n' + habits.map(h => {
          const done = isCompletedToday(h);
          return `- ${h.name}: ${done ? '✅ done' : '❌ not done'} (streak: ${h.streak || 0} day${h.streak !== 1 ? 's' : ''}, ${h.frequency})`;
        }).join('\n')
      : '(no habits set)';

    // ── Expenses with budget context ───────────────────────────────────────
    const expenseBlock = Object.keys(expenseSummary).length
      ? Object.entries(expenseSummary).map(([c, a]) => {
          const budget = budgets[c];
          const pct = budget ? Math.round((a / budget) * 100) : null;
          const flag = pct !== null && pct >= 80 ? (pct >= 100 ? ' ⚠️ OVER BUDGET' : ` (${pct}% of ₹${budget} budget)`) : '';
          return `${c}: ₹${Math.round(a)}${flag}`;
        }).join(', ')
      : '(no expenses this month)';

    // ── Memory ─────────────────────────────────────────────────────────────
    const memoryBlock = this.selectMemories(memories, message)
      .map(m => `- ${m.key || m.category}: ${m.value}`).join('\n') || '(none yet)';

    // ── Proactive observations ─────────────────────────────────────────────
    const observations = this.buildObservations(tasks, habits, expenseSummary, budgets, todayStr);
    const obsBlock = observations.length
      ? `\nPROACTIVE OBSERVATIONS (weave these naturally into your reply if relevant):\n${observations.join('\n')}`
      : '';

    // ── Session ────────────────────────────────────────────────────────────
    const sessionBlock = pendingSession
      ? `\nACTIVE FOLLOW-UP:\nGoal: ${pendingSession.waiting_for}\nPartial data: ${JSON.stringify(pendingSession.partial || {})}\nThe user is now answering your question — use this to complete the goal.\n`
      : '';

    // ── Assemble context ───────────────────────────────────────────────────
    const contextParts = [
      timeBlock,
      calendarContext ? calendarContext.trim() : null,
      `PENDING TASKS:\n${taskBlock}`,
      habitBlock,
      `THIS MONTH'S SPENDING: ${expenseBlock}`,
      journalLines ? `RECENT JOURNAL:\n${journalLines}` : null,
      `LONG-TERM MEMORY:\n${memoryBlock}`,
      activeDoc ? activeDoc.trim() : null,
      obsBlock || null,
      sessionBlock || null,
      `USER MESSAGE: ${message}`
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentTurns,
      { role: 'user', content: contextParts }
    ];

    let raw;
    try {
      raw = await llm.chat(messages, 0.6);
    } catch (error) {
      logger.error('Conversation engine LLM failed', { error: error.message });
      return "Something glitched on my end. Try that again?";
    }

    const parsed = this.parseResponse(raw);

    // ── Execute actions ────────────────────────────────────────────────────
    await this.executeActions(userId, parsed.actions, tasks, habits);

    await conversationMemory.addTurn(userId, 'user', message);
    await conversationMemory.addTurn(userId, 'assistant', parsed.reply);

    // ── Budget warnings surfaced during actions ────────────────────────────
    if (this._pendingWarnings && this._pendingWarnings.length) {
      parsed.reply += '\n\n' + this._pendingWarnings.join('\n');
      this._pendingWarnings = [];
    }

    // ── Reply guardrails ───────────────────────────────────────────────────
    return this.cleanReply(parsed.reply, recentTurns.length);
  }

  cleanReply(reply, priorTurnCount) {
    if (!reply) return "Got it.";
    // Strip filler phrases
    reply = reply
      .replace(/how can I (assist|help) you\??/gi, '')
      .replace(/is there anything else( I can (help|do|assist) (you )?with)?\??/gi, '')
      .trim();
    // Strip leading greeting on follow-up turns
    if (priorTurnCount > 0) {
      reply = reply.replace(/^(hi|hello|hey|good (morning|afternoon|evening))[!,]?\s*/i, '');
    }
    return reply.trim() || "Got it.";
  }

  parseResponse(raw) {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        return {
          reply: obj.reply || "Got it.",
          actions: Array.isArray(obj.actions) ? obj.actions : []
        };
      }
    } catch (e) {
      logger.debug('Failed to parse engine response', { raw: raw.slice(0, 200) });
    }
    return { reply: raw.trim() || "Got it.", actions: [] };
  }

  async executeActions(userId, actions, currentTasks, currentHabits) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_task': {
            const deadline = parseDate(action.deadline_text);
            await taskService.create(userId, {
              title: action.title,
              date: deadline,
              priority: action.priority || 'medium',
              recurrence_text: action.recurrence_text || ''
            });
            break;
          }
          case 'create_habit': {
            await habitService.create(userId, {
              title: action.name,
              recurrence_text: action.recurrence || 'daily'
            });
            break;
          }
          case 'complete_habit': {
            const liveHabits = await habitService.getUserHabits(userId);
            const h = habitService.matchHabit(liveHabits, action.match);
            if (h) await habitService.markComplete(h._docId || h.id);
            else logger.warn('complete_habit: no match', { match: action.match });
            break;
          }
          case 'delete_habit': {
            const liveHabits = await habitService.getUserHabits(userId);
            const h = habitService.matchHabit(liveHabits, action.match);
            if (h) await habitService.delete(h._docId || h.id);
            else logger.warn('delete_habit: no match', { match: action.match });
            break;
          }
          case 'delete_all_habits': {
            const liveHabits = await habitService.getUserHabits(userId);
            if (liveHabits.length > 0) {
              await Promise.all(liveHabits.map(h => habitService.delete(h._docId || h.id)));
              logger.info('All habits deleted', { userId, count: liveHabits.length });
            }
            break;
          }
          case 'create_expense': {
            logger.info('create_expense action firing', { userId, amount: action.amount, category: action.category });
            await expenseService.create(userId, {
              amount: action.amount,
              category: action.category || 'other',
              description: action.description || ''
            });
            logger.info('create_expense saved', { userId, amount: action.amount, category: action.category });
            const { budgetService } = await import('../expenses/budgetService.js');
            const warning = await budgetService.checkBudgetWarning(userId, action.category || 'other');
            if (warning) {
              this._pendingWarnings = this._pendingWarnings || [];
              this._pendingWarnings.push(warning);
            }
            break;
          }
          case 'store_memory': {
            await memoryService.store(userId, {
              key: action.key,
              value: action.value,
              description: action.value
            });
            break;
          }
          case 'complete_task': {
            const t = this.matchTask(currentTasks, action.match);
            if (t) await taskService.updateStatus(t.id, 'completed');
            break;
          }
          case 'delete_task': {
            const t = this.matchTask(currentTasks, action.match);
            if (t) await taskService.delete(t.id);
            break;
          }
          case 'ask_followup': {
            await this.setSession(userId, {
              waiting_for: action.waiting_for || 'info',
              partial: action.partial || {},
              createdAt: new Date()
            });
            break;
          }
          case 'create_calendar_event': {
            const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
            const startTime = parseDate(action.date);
            const endTime = action.end_date ? parseDate(action.end_date) : null;
            if (startTime) {
              const result = await googleCalendarService.createEvent(userId, {
                title: action.title || 'Event',
                startTime,
                endTime,
                description: action.description || '',
                location: action.location || ''
              });
              if (result?.error === 'not_connected') {
                this._pendingWarnings = this._pendingWarnings || [];
                this._pendingWarnings.push('(Calendar not connected — use /connectcalendar to link Google Calendar)');
              } else if (result?.success && result.link) {
                this._pendingWarnings = this._pendingWarnings || [];
                this._pendingWarnings.push(`🗓 [View in Google Calendar](${result.link})`);
              }
            }
            break;
          }
          default:
            logger.debug('Unknown action type', { type: action.type });
        }
      } catch (error) {
        logger.error('Action execution failed', { action: action.type, error: error.message });
      }
    }
  }

  // ── Context helpers ──────────────────────────────────────────────────────

  buildObservations(tasks, habits, expenseSummary, budgets, todayStr) {
    const obs = [];

    // Overdue tasks
    tasks
      .filter(t => t.deadline && istDateStr(t.deadline) < todayStr)
      .forEach(t => obs.push(`⚠️ OVERDUE: "${t.title}" was due ${formatDate(t.deadline)}`));

    // Due today
    tasks
      .filter(t => t.deadline && istDateStr(t.deadline) === todayStr)
      .forEach(t => obs.push(`📌 DUE TODAY: "${t.title}"`));

    // Habits not done
    const pendingHabits = habits.filter(h => !isCompletedToday(h));
    if (pendingHabits.length) {
      obs.push(`🎯 HABITS PENDING: ${pendingHabits.map(h => h.name).join(', ')}`);
    }

    // Streak at risk: daily habit, has streak > 0, last completed more than 1 day ago
    habits.forEach(h => {
      if ((h.frequency === 'daily' || h.intervalDays === 1) && h.streak > 0 && !isCompletedToday(h)) {
        const last = h.lastCompleted?.toDate ? h.lastCompleted.toDate() : (h.lastCompleted ? new Date(h.lastCompleted) : null);
        if (last && (Date.now() - last.getTime()) > 24 * 60 * 60 * 1000) {
          obs.push(`🔥 STREAK AT RISK: ${h.name} (${h.streak} day streak)`);
        }
      }
    });

    // Budget alerts
    Object.entries(expenseSummary).forEach(([cat, spent]) => {
      const budget = budgets[cat];
      if (budget) {
        const pct = spent / budget;
        if (pct >= 0.8) {
          obs.push(`💰 BUDGET ALERT: ${cat} at ₹${Math.round(spent)} of ₹${budget} (${Math.round(pct * 100)}%)`);
        }
      }
    });

    return obs;
  }

  async getActiveDocContext(userId) {
    try {
      const { pdfService } = await import('../documents/pdfService.js');
      const doc = await pdfService.getActiveDoc(userId);
      if (!doc) return '';
      pdfService.touchActiveDoc(userId).catch(() => {});
      return `ACTIVE DOCUMENT (answer questions about it using this content):\nSummary: ${doc.summary}\n\nContent excerpt:\n${doc.text}`;
    } catch {
      return '';
    }
  }

  async getCalendarContext(userId) {
    try {
      const tokenDoc = await db.collection('google_tokens').doc(userId.toString()).get();
      if (!tokenDoc.exists) return '';
      const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
      const events = await googleCalendarService.listTodayEvents(userId);
      if (!Array.isArray(events) || !events.length) return 'TODAY\'S CALENDAR: (no events)';
      const lines = events.map(e => {
        const t = new Date(e.start);
        const time = isNaN(t) ? e.start : t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        return `- ${e.title} at ${time}${e.location ? ` @ ${e.location}` : ''}`;
      }).join('\n');
      return `TODAY'S CALENDAR:\n${lines}`;
    } catch {
      return '';
    }
  }

  async getJournalLines(userId) {
    try {
      const { journalService } = await import('../journal/journalService.js');
      const entries = await journalService.getUserEntries(userId, 7);
      if (!entries || !entries.length) return '';
      return entries.slice(0, 3).map(e => {
        const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
        const label = e.title || (e.content || '').slice(0, 60);
        return `- "${label}" (${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })})`;
      }).join('\n');
    } catch {
      return '';
    }
  }

  async getBudgets(userId) {
    try {
      const { budgetService } = await import('../expenses/budgetService.js');
      return budgetService.getBudgets(userId);
    } catch {
      return { food: 8000, travel: 5000, shopping: 5000, education: 3000, health: 3000, other: 3000 };
    }
  }

  selectMemories(memories, message, topN = 5) {
    if (!memories.length) return [];
    const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const pinned = memories.filter(m => m.always);
    const rest = memories.filter(m => !m.always);
    const scored = rest.map(m => {
      const hay = `${m.key} ${m.value}`.toLowerCase();
      const score = words.filter(w => hay.includes(w)).length;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const slots = Math.max(0, topN - pinned.length);
    return [...pinned, ...scored.slice(0, slots).map(s => s.m)];
  }

  matchTask(tasks, matchText) {
    if (!matchText || !tasks.length) return null;
    const words = matchText.toLowerCase().split(/\s+/);
    let best = null, bestScore = 0;
    for (const t of tasks) {
      const title = (t.title || '').toLowerCase();
      const score = words.filter(w => w.length > 2 && title.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return bestScore > 0 ? best : null;
  }
}

export const conversationEngine = new ConversationEngine();
