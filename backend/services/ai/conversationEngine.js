import { config } from 'dotenv';
config();

import { db } from '../../config/firebase.js';
import { llm, isTokenBudgetLow } from './llmAdapter.js';
import { logger } from '../../utils/logger.js';
import { parseDate, formatDate } from './dateParser.js';
import { conversationMemory } from '../memory/conversationMemory.js';
import { memoryService } from '../memory/memoryService.js';
import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { habitService } from '../habits/habitService.js';
import { contactService } from '../contacts/contactService.js';
import { telegramService } from '../telegram/telegramService.js';
import { winsService } from '../wins/winsService.js';

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

// ── Runtime config ──────────────────────────────────────────────────────────
const USER_NAME     = process.env.USER_NAME     || 'User';
const USER_TIMEZONE = process.env.USER_TIMEZONE || 'Asia/Kolkata';
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';

// ── Conversation prompt — free-form mode (no JSON, pure personality) ───────
const CONVERSATION_PROMPT = `You are ${USER_NAME}'s personal chief-of-staff and close confidant. Direct, witty, occasionally dry. You pick sides ("go with A because…"), match energy, and understand Indian context. No filler ("How can I assist?", "Great question!", "Feel free to ask.").

Short messages → 1-2 sentences. Questions → answer first. Advice → opinionated. Stress/venting → acknowledge before helping, don't be chirpy. Late night → warmer. Early morning → brief.

RESPOND AS PLAIN TEXT. No JSON. No bullet lists unless the content genuinely needs structure.`;

// ── Action prompt core — structured mode (JSON required) ───────────────────
const ACTION_PROMPT_CORE = `You are ${USER_NAME}'s chief-of-staff (timezone: ${USER_TIMEZONE}). Respond with valid JSON only: {"reply":"...","actions":[...]}

REPLY: One natural sentence confirming the action. Two sentences max — add a brief implication only if genuinely useful. No filler, no announcements.${DASHBOARD_URL ? `\n"my dashboard" → ${DASHBOARD_URL}` : ''}

RULES:
- Habits are recurring — never create_task for a habit.
- "delete all habits/expenses" → delete_all_* type, NO match field.
- Expense period: "today|this_week|this_month" | Task period: "today|this_week|completed"
- send_whatsapp: confirm draft in reply, no raw URL (system appends link).
- WIN_CAPTURE_PENDING → store_win with exact words. Also emit store_win for natural wins ("finished X", "proud of Y").
- FOLLOW-UP present → complete the goal, don't ask again.
- QUICK CAPTURE: "200 chai"→expense | "gym done"→complete_habit | "mtg 3pm"→calendar event | "Riya bday May5"→store_memory`;

// Action schemas — only appended when message likely needs an action
const ACTION_SCHEMAS = `ACTIONS (emit in "actions" array):
{"type":"create_task","title":"...","deadline_text":"raw date","recurrence_text":"raw recurrence","priority":"high|medium|low"}
{"type":"create_expense","amount":0,"category":"food|travel|shopping|education|health|other","description":"..."}
{"type":"delete_expense","match":"keyword"} | {"type":"delete_all_expenses"} | {"type":"delete_expenses_timerange","period":"today|this_week|this_month"}
{"type":"store_memory","key":"...","value":"..."}
{"type":"complete_task","match":"keywords"} | {"type":"delete_task","match":"keywords"} | {"type":"delete_tasks_timerange","period":"today|this_week|completed"}
{"type":"create_habit","name":"...","recurrence":"daily|weekly|weekdays|..."} | {"type":"complete_habit","match":"keyword"} | {"type":"delete_habit","match":"name"} | {"type":"delete_all_habits"}
{"type":"create_calendar_event","title":"...","date":"raw","end_date":"raw","location":"...","description":"..."}
{"type":"create_contact","name":"...","phone":"...","relationship":"..."} | {"type":"save_to_phone","name":"...","phone":"...","email":"..."}
{"type":"send_whatsapp","contact_name":"...","message":"..."} — name must match KNOWN CONTACTS
{"type":"phone_call","contact_name":"..."} | {"type":"send_sms","contact_name":"...","message":"..."}
{"type":"navigate","destination":"..."} | {"type":"play_music","query":"..."} | {"type":"web_open","url_or_query":"..."} | {"type":"set_timer","minutes":5,"label":"..."}
{"type":"web_search","query":"3-6 word query"} — news, live prices, facts you're uncertain of; placeholder reply: "Let me check."
{"type":"store_win","text":"..."} — accomplishment shared by user
{"type":"create_list","name":"..."} | {"type":"add_to_list","list_name":"...","item":"..."} | {"type":"remove_from_list","list_name":"...","item":"..."} | {"type":"show_list","list_name":"..."} | {"type":"share_list","list_name":"...","share_with":"telegram_user_id"}
{"type":"ask_followup","waiting_for":"label","partial":{}}
If contact not found for call/SMS: "I don't have [name]'s number — save it with 'save [name]'s number [number]'"
Examples: "call Mom"→phone_call | "text dad I'll be late"→send_sms | "navigate to airport"→navigate | "play lo-fi"→play_music | "open Swiggy"→web_open | "10 min timer"→set_timer`;

// ── App shortcut map ────────────────────────────────────────────────────────
const APP_URLS = {
  amazon: 'https://www.amazon.in',
  flipkart: 'https://www.flipkart.com',
  swiggy: 'https://www.swiggy.com',
  zomato: 'https://www.zomato.com',
  uber: 'https://m.uber.com',
  ola: 'https://www.olacabs.com',
  gpay: 'https://pay.google.com',
  paytm: 'https://paytm.com',
  linkedin: 'https://www.linkedin.com',
  instagram: 'https://www.instagram.com',
  twitter: 'https://www.twitter.com',
  youtube: 'https://www.youtube.com',
  gmail: 'https://mail.google.com',
  maps: 'https://maps.google.com',
  drive: 'https://drive.google.com',
  moodle: 'https://moodle.iima.ac.in',
  notion: 'https://www.notion.so',
  spotify: 'https://open.spotify.com',
  netflix: 'https://www.netflix.com',
  hotstar: 'https://www.hotstar.com'
};

// ── Message classification ──────────────────────────────────────────────────

function classifyMessage(msg) {
  const m = (msg || '').trim();
  if (!m) return 'conversation';
  if (/^\d+[\s₹]/.test(m)) return 'action'; // "200 chai" → expense
  if (/^(add|create|remove|delete|set|save|log|spent|track)\b/i.test(m)) return 'action';
  if (/^(remind|schedule|plan|book|cancel)\b/i.test(m)) return 'action';
  if (/^(call|text|send|navigate|play|open)\b/i.test(m)) return 'action';
  if (/^(done|complete|finish|mark)\b/i.test(m)) return 'action';
  if (/\b(task|expense|habit|budget|calendar|timer|alarm|list|lists)\b/i.test(m)) return 'action';
  if (/\b(remind|schedule|todo|to-do|to do|spending|spent|paid|buy|shopping|grocery)\b/i.test(m)) return 'action';
  if (/\b(whatsapp|contact|phone number|call\s+\w|text\s+\w|navigate to|directions to|play\s+\w|open\s+\w|set.*timer|set.*alarm)\b/i.test(m)) return 'action';
  if (/\b(news|search for|look up|find out|win|wins|proud|bday|birthday)\b/i.test(m)) return 'action';
  return 'conversation';
}

function buildTimeBlock(now) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  return `NOW: ${DAYS[now.getUTCDay()]} ${now.getUTCDate()} ${MONS[now.getUTCMonth()]} ${now.getUTCFullYear()} ${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'PM' : 'AM'} IST`;
}

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
    const mode = classifyMessage(message);
    if (mode === 'conversation') {
      return await this.handleConversation(userId, chatId, message);
    }
    return await this.handleAction(userId, chatId, message);
  }

  // ── Action mode — JSON format, full context, structured responses ─────────

  async handleAction(userId, chatId, message) {
    const now = istNow();
    const timeBlock = buildTimeBlock(now);
    const todayStr = now.toISOString().slice(0, 10);

    // ── Determine which optional context sections are needed ───────────────
    const wantsContacts = /contact|whatsapp|message\s+\w|phone|number|vcf|send.*to|\bcall\b|text\s+\w|\bsms\b|\btell\s+\w/i.test(message);
    const wantsJournal  = /journal|mood|feeling|reflect/i.test(message);
    const wantsDoc      = /pdf|document|summarize|paper|article/i.test(message);

    // ── Parallel fetch — skip optional sections when not needed ────────────
    const [recentTurns, memories, tasks, habits, pendingSession,
           calendarContext, expenseSummary, budgets, contacts, journalLines, activeDoc,
           winPending] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      taskService.getUserTasks(userId, 'pending'),
      habitService.getUserHabits(userId).catch(() => []),
      this.getSession(userId),
      this.getCalendarContext(userId),
      expenseService.getMonthlySummary(userId),
      this.getBudgets(userId),
      wantsContacts ? contactService.getUserContacts(userId).catch(() => []) : Promise.resolve([]),
      wantsJournal  ? this.getJournalLines(userId) : Promise.resolve(null),
      wantsDoc      ? this.getActiveDocContext(userId) : Promise.resolve(null),
      winsService.getWinPending(userId).catch(() => false)
    ]);

    if (pendingSession) await this.clearSession(userId);

    // ── Compact task block (single line) ───────────────────────────────────
    const overdueTasks  = tasks.filter(t => t.deadline && istDateStr(t.deadline) < todayStr);
    const dueTodayTasks = tasks.filter(t => t.deadline && istDateStr(t.deadline) === todayStr);
    const upcomingTasks = tasks.filter(t => !t.deadline || istDateStr(t.deadline) > todayStr);

    const fmtTask = t => `${t.title}[${(t.priority || 'M')[0].toUpperCase()}]${t.deadline ? ` ${formatDate(t.deadline)}` : ''}`;
    const taskParts = [];
    if (overdueTasks.length)  taskParts.push(`⚠️OVERDUE: ${overdueTasks.map(fmtTask).join(', ')}`);
    if (dueTodayTasks.length) taskParts.push(`TODAY: ${dueTodayTasks.map(fmtTask).join(', ')}`);
    if (upcomingTasks.length) taskParts.push(`UPCOMING: ${upcomingTasks.slice(0, 5).map(fmtTask).join(', ')}`);
    const taskBlock = `TASKS: ${taskParts.join(' | ') || 'none'}`;

    // ── Compact habit block (single line) ─────────────────────────────────
    const habitBlock = habits.length
      ? 'HABITS: ' + habits.map(h => `${isCompletedToday(h) ? '✅' : '❌'} ${h.name}(${h.streak || 0}d)`).join(' | ')
      : 'HABITS: none';

    // ── Expense block with budget flags ────────────────────────────────────
    const expenseBlock = Object.keys(expenseSummary).length
      ? 'SPENDING: ' + Object.entries(expenseSummary).map(([c, a]) => {
          const b = budgets[c];
          const pct = b ? Math.round((a / b) * 100) : null;
          const flag = pct !== null && pct >= 80 ? (pct >= 100 ? '⚠️OVER' : `${pct}%`) : '';
          return `${c} ₹${Math.round(a)}${b ? `/₹${b}${flag ? ' ' + flag : ''}` : ''}`;
        }).join(', ')
      : 'SPENDING: none this month';

    // ── Memory ─────────────────────────────────────────────────────────────
    const memBlk = this.selectMemories(memories, message)
      .map(m => `- ${m.key || m.category}: ${m.value}`).join('\n') || '(none)';

    // ── Proactive observations (cap at 5 to control token use) ────────────
    const observations = this.buildObservations(tasks, habits, expenseSummary, budgets, todayStr).slice(0, 5);

    // ── Contacts — names only for the LLM (phone lookup done in executeActions) ─
    const contactBlock = wantsContacts && contacts.length
      ? 'KNOWN CONTACTS: ' + contacts.slice(0, 10).map(c => c.name).join(', ')
        + (contacts.length > 10 ? ` (+${contacts.length - 10} more)` : '')
      : null;

    // ── Session ────────────────────────────────────────────────────────────
    const sessionBlock = pendingSession
      ? `FOLLOW-UP GOAL: ${pendingSession.waiting_for}\nPartial: ${JSON.stringify(pendingSession.partial || {})}\nUser is answering — complete the goal.`
      : null;

    // ── Assemble context ───────────────────────────────────────────────────
    const contextParts = [
      timeBlock,
      calendarContext ? calendarContext.trim() : null,
      taskBlock,
      habitBlock,
      expenseBlock,
      journalLines ? `JOURNAL:\n${journalLines}` : null,
      `MEMORY:\n${memBlk}`,
      contactBlock,
      activeDoc ? activeDoc.trim() : null,
      observations.length ? `OBSERVATIONS (surface if relevant):\n${observations.join('\n')}` : null,
      sessionBlock,
      winPending ? 'WIN_CAPTURE_PENDING: user is answering "what are you proud of today?" — store their reply as a win.' : null,
      `USER: ${message}`
    ].filter(Boolean).join('\n\n');

    // ── Assemble action system prompt — always includes schemas ───────────
    const budgetWarning = isTokenBudgetLow() ? '\nTOKEN BUDGET LOW: Keep reply under 20 words.' : '';
    const systemPrompt = ACTION_PROMPT_CORE + '\n\n' + ACTION_SCHEMAS + budgetWarning;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentTurns,
      { role: 'user', content: contextParts }
    ];

    let raw;
    try {
      raw = await llm.chat(messages, 0.3);
    } catch (error) {
      logger.error('Action LLM failed', { error: error.message });
      return "Something glitched on my end. Try that again?";
    }

    const parsed = this.parseResponse(raw);

    // ── Execute actions ────────────────────────────────────────────────────
    this._calendarNote = null;
    this._whatsappLink = null;
    this._searchResults = null;
    this._searchQuery = null;
    this._vcfContact = null;
    this._quickAction = null;
    this._listContent = null;
    await this.executeActions(userId, parsed.actions, tasks, habits, contacts);

    // ── Win capture: clear pending flag once captured ──────────────────────
    if (winPending && parsed.actions?.some(a => a.type === 'store_win')) {
      winsService.clearWinPending(userId).catch(() => {});
    }

    // ── List display: override reply with formatted list ───────────────────
    if (this._listContent) {
      parsed.reply = this._listContent;
      this._listContent = null;
    }

    // ── Second LLM call: synthesise search results ─────────────────────────
    if (this._searchResults) {
      try {
        const searchContext = `The user asked: "${message}"\n\nI searched for: "${this._searchQuery}"\n\nSearch results:\n${this._searchResults}\n\nUsing these results, give a concise, direct answer (2-4 sentences). Cite the source URL or name if relevant. If results are insufficient, say so briefly and share what you do know.`;
        const grounded = await llm.call(
          `You are ${USER_NAME}'s chief-of-staff. Answer their question using these search results in 2-4 sentences. Cite the source name or URL briefly. No filler.`,
          searchContext,
          0.3
        );
        if (grounded) parsed.reply = grounded;
      } catch (err) {
        logger.error('Search synthesis LLM call failed', { error: err.message });
        parsed.reply = `I searched for "${this._searchQuery}" but couldn't synthesise the results right now. Here's what I found:\n\n${this._searchResults.slice(0, 500)}`;
      }
      this._searchResults = null;
      this._searchQuery = null;
    }

    await conversationMemory.addTurn(userId, 'user', message);
    await conversationMemory.addTurn(userId, 'assistant', parsed.reply);

    // ── Reply guardrails ───────────────────────────────────────────────────
    let reply = this.cleanReply(parsed.reply, recentTurns.length);

    // Append calendar link cleanly after the reply (separate from LLM text)
    if (this._calendarNote) {
      reply += '\n' + this._calendarNote;
      this._calendarNote = null;
    }

    // Append WhatsApp deep link (functional, not an error message)
    if (this._whatsappLink) {
      const { url } = this._whatsappLink;
      reply += `\n\n👉 [Tap to send on WhatsApp](${url})`;
      this._whatsappLink = null;
    }

    // Send VCF contact file (fire-and-forget alongside the text reply)
    if (this._vcfContact) {
      const { name, phone, email } = this._vcfContact;
      telegramService.sendContactVCF(chatId, name, phone, email).catch(err =>
        logger.error('sendContactVCF failed', { error: err.message })
      );
      this._vcfContact = null;
    }

    return reply;
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

  async executeActions(userId, actions, currentTasks, currentHabits, currentContacts = []) {
    // Contacts created in this same turn — checked before re-querying Firestore
    // so that create_contact + send_whatsapp in one turn works without a round-trip.
    const justCreatedContacts = [];

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
            break;
          }
          case 'delete_all_expenses': {
            const count = await expenseService.deleteAll(userId);
            logger.info('delete_all_expenses completed', { userId, count });
            break;
          }
          case 'delete_expense': {
            const deleted = await expenseService.deleteByKeyword(userId, action.match || '');
            if (deleted === 0) logger.warn('delete_expense: no match found', { match: action.match });
            else logger.info('delete_expense completed', { userId, match: action.match, count: deleted });
            break;
          }
          case 'delete_expenses_timerange': {
            let count = 0;
            switch (action.period) {
              case 'today':      count = await expenseService.deleteToday(userId); break;
              case 'this_week':  count = await expenseService.deleteThisWeek(userId); break;
              case 'this_month': count = await expenseService.deleteThisMonth(userId); break;
              case 'all':        count = await expenseService.deleteAll(userId); break;
              default: logger.warn('delete_expenses_timerange: unknown period', { period: action.period });
            }
            logger.info('delete_expenses_timerange completed', { userId, period: action.period, count });
            break;
          }
          case 'delete_tasks_timerange': {
            let count = 0;
            switch (action.period) {
              case 'today':     count = await taskService.deleteToday(userId); break;
              case 'this_week': count = await taskService.deleteThisWeek(userId); break;
              case 'completed': count = await taskService.deleteCompleted(userId); break;
              default: logger.warn('delete_tasks_timerange: unknown period', { period: action.period });
            }
            logger.info('delete_tasks_timerange completed', { userId, period: action.period, count });
            break;
          }
          case 'create_contact': {
            const saved = await contactService.create(userId, {
              name: action.name,
              phone: action.phone || '',
              relationship: action.relationship || ''
            });
            // Track in-turn so send_whatsapp / save_to_phone can find it immediately
            justCreatedContacts.push(saved);
            break;
          }
          case 'save_to_phone': {
            // Resolve phone from action, or fall back to a just-created/stored contact
            let { name, phone, email } = action;
            if (!phone) {
              const match = contactService.matchContact(
                [...justCreatedContacts, ...(await contactService.getUserContacts(userId))],
                name
              );
              if (match) { phone = match.phone; email = email || match.email || ''; }
            }
            if (name && phone) {
              this._vcfContact = { name, phone, email: email || '' };
            } else {
              logger.warn('save_to_phone: missing name or phone', { name, phone });
            }
            break;
          }
          case 'send_whatsapp': {
            // Check same-turn creates first, then fall back to Firestore
            let contact = contactService.matchContact(justCreatedContacts, action.contact_name);
            if (!contact) {
              const liveContacts = await contactService.getUserContacts(userId);
              contact = contactService.matchContact(liveContacts, action.contact_name);
            }
            if (contact?.phone) {
              const dialCode = contact.phone.length === 10 ? `91${contact.phone}` : contact.phone;
              const url = `https://wa.me/${dialCode}?text=${encodeURIComponent(action.message)}`;
              this._whatsappLink = { url, contactName: contact.name, message: action.message };
            } else {
              // Don't mutate reply — LLM already wrote a coherent response.
              // Log so we can diagnose if contacts aren't loading.
              logger.warn('send_whatsapp: contact not found or no phone', {
                contact_name: action.contact_name,
                justCreatedCount: justCreatedContacts.length,
                contact: contact?.name
              });
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
                this._calendarNote = '(Calendar not connected — use /connectcalendar to link Google Calendar)';
              } else if (result?.success && result.link) {
                this._calendarNote = `📅 [View in Google Calendar](${result.link})`;
              }
            }
            break;
          }
          case 'phone_call': {
            let callContacts = [...justCreatedContacts, ...currentContacts];
            let callContact = contactService.matchContact(callContacts, action.contact_name);
            if (!callContact) {
              // Fallback: contacts weren't pre-loaded (wantsContacts regex missed) — fetch live
              const liveContacts = await contactService.getUserContacts(userId);
              callContact = contactService.matchContact(liveContacts, action.contact_name);
            }
            if (callContact?.phone) {
              const dialCode = callContact.phone.length === 10 ? `+91${callContact.phone}` : `+${callContact.phone}`;
              this._quickAction = { label: `📞 Call ${callContact.name}`, url: `tel:${dialCode}` };
            } else {
              logger.warn('phone_call: contact not found', { contact_name: action.contact_name });
            }
            break;
          }
          case 'send_sms': {
            let smsContacts = [...justCreatedContacts, ...currentContacts];
            let smsContact = contactService.matchContact(smsContacts, action.contact_name);
            if (!smsContact) {
              const liveContacts = await contactService.getUserContacts(userId);
              smsContact = contactService.matchContact(liveContacts, action.contact_name);
            }
            if (smsContact?.phone) {
              const dialCode = smsContact.phone.length === 10 ? `+91${smsContact.phone}` : `+${smsContact.phone}`;
              const body = encodeURIComponent(action.message || '');
              this._quickAction = { label: `💬 SMS ${smsContact.name}`, url: `sms:${dialCode}?body=${body}` };
            } else {
              logger.warn('send_sms: contact not found', { contact_name: action.contact_name });
            }
            break;
          }
          case 'navigate': {
            const dest = encodeURIComponent(action.destination || '');
            this._quickAction = { label: `🗺️ Navigate to ${action.destination}`, url: `https://www.google.com/maps/dir/?api=1&destination=${dest}` };
            break;
          }
          case 'play_music': {
            const q = encodeURIComponent(action.query || '');
            this._quickAction = { label: `🎵 Play on YouTube Music`, url: `https://music.youtube.com/search?q=${q}` };
            break;
          }
          case 'web_open': {
            const key = (action.url_or_query || '').toLowerCase().trim();
            const knownUrl = Object.entries(APP_URLS).find(([app]) => key.includes(app))?.[1];
            const url = knownUrl || `https://www.google.com/search?q=${encodeURIComponent(action.url_or_query || '')}`;
            const label = knownUrl ? `🔗 Open ${action.url_or_query}` : `🔍 Search: ${action.url_or_query}`;
            this._quickAction = { label, url };
            break;
          }
          case 'set_timer': {
            const mins = Math.max(1, parseInt(action.minutes) || 5);
            const label = action.label ? `⏱️ ${mins}min — ${action.label}` : `⏱️ Set ${mins}min timer`;
            this._quickAction = { label, url: `https://www.google.com/search?q=set+timer+${mins}+minutes` };
            break;
          }
          case 'web_search': {
            try {
              const { webSearchService } = await import('../search/webSearchService.js');
              const results = await webSearchService.search(action.query || '');
              this._searchResults = webSearchService.formatForLLM(results);
              this._searchQuery = action.query || '';
              logger.info('web_search completed', { query: action.query, resultCount: results.length });
            } catch (err) {
              logger.error('web_search action failed', { error: err.message });
              this._searchResults = null;
            }
            break;
          }
          case 'store_win': {
            if (action.text?.trim()) {
              await winsService.storeWin(userId, action.text.trim());
            }
            break;
          }
          case 'create_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            const list = await sharedListService.createList(userId, action.name || 'My List');
            logger.info('List created via action', { userId, name: list.name });
            break;
          }
          case 'add_to_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            await sharedListService.addItem(userId, action.list_name || '', action.item || '');
            break;
          }
          case 'remove_from_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            await sharedListService.removeItem(userId, action.list_name || '', action.item || '');
            break;
          }
          case 'show_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            const list = await sharedListService.findList(userId, action.list_name || '');
            this._listContent = sharedListService.formatList(list);
            break;
          }
          case 'share_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            await sharedListService.shareList(userId, action.list_name || '', action.share_with || '');
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

    // Budget alerts intentionally omitted here — spending data with ⚠️ flags
    // is already in the THIS MONTH'S SPENDING context block. Repeating it in
    // observations caused the LLM to mention budget in every single reply.

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

  matchContact(contacts, name) {
    if (!name || !contacts?.length) return null;
    const target = name.toLowerCase().trim();
    return contacts.find(c => c.name.toLowerCase() === target) ||
           contacts.find(c => c.name.toLowerCase().split(' ')[0] === target) ||
           contacts.find(c => c.name.toLowerCase().startsWith(target)) ||
           contacts.find(c => c.name.toLowerCase().includes(target)) ||
           null;
  }

  // ── Conversation mode helpers ─────────────────────────────────────────────

  getTimeContext() {
    const now = new Date();
    const tz = USER_TIMEZONE;
    const options = { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz };
    const timeStr = now.toLocaleString('en-IN', options);
    const localHour = parseInt(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: tz }), 10);
    let period = 'morning';
    if (localHour >= 12 && localHour < 17) period = 'afternoon';
    else if (localHour >= 17 && localHour < 21) period = 'evening';
    else if (localHour >= 21 || localHour < 5) period = 'night';
    return `${timeStr} (${period})`;
  }

  async getQuickStatus(userId) {
    try {
      const tasks = await taskService.getUserTasks(userId, 'pending');
      const overdue = tasks.filter(t => t.deadline && new Date(t.deadline?.toDate ? t.deadline.toDate() : t.deadline) < new Date());
      if (!tasks.length) return null;
      let s = '';
      if (overdue.length) s += `${overdue.length} overdue. `;
      s += `${tasks.length} pending.`;
      return s.trim() || null;
    } catch { return null; }
  }

  // ── Conversation mode — free-form, personality-first responses ────────────

  async handleConversation(userId, chatId, message) {
    const [recentTurns, memories, winPending] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      winsService.getWinPending(userId).catch(() => false)
    ]);

    // Win capture: user answered the evening "what are you proud of?" prompt
    let winContext = '';
    if (winPending && message.trim().length > 3) {
      try {
        await winsService.storeWin(userId, message.trim());
        await winsService.clearWinPending(userId);
        winContext = `\n\nWIN_JUST_CAPTURED: The user just shared their win: "${message.trim()}". Celebrate it briefly and warmly — one sentence is enough.`;
      } catch (err) {
        logger.error('Win capture in conversation mode failed', { error: err.message });
      }
    }

    const memBlk = this.selectMemories(memories, message, 6)
      .map(m => `- ${m.key || m.category}: ${m.value}`).join('\n');

    const quickStatus = await this.getQuickStatus(userId).catch(() => null);
    const timeCtx = this.getTimeContext();

    const contextMessage = [
      `Current: ${timeCtx}`,
      quickStatus ? `Quick status: ${quickStatus}` : null,
      memBlk ? `About ${USER_NAME}:\n${memBlk}` : null,
      winContext || null,
      `Message: ${message}`
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: CONVERSATION_PROMPT },
      ...recentTurns,
      { role: 'user', content: contextMessage }
    ];

    let reply;
    try {
      reply = await llm.chat(messages, 0.8);
    } catch (err) {
      logger.error('Conversation LLM failed', { error: err.message });
      return "Something glitched on my end. Try again?";
    }

    // Strip any JSON leak (LLM sometimes falls back to JSON even with plain text instruction)
    if (reply?.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0]);
        reply = parsed.reply || reply;
      } catch { /* use raw reply */ }
    }

    await conversationMemory.addTurn(userId, 'user', message);
    await conversationMemory.addTurn(userId, 'assistant', reply || 'Got it.');
    return this.cleanReply(reply, recentTurns.length);
  }
}

export const conversationEngine = new ConversationEngine();
