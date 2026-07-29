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

const SYSTEM_PROMPT = `You are Abhishek's personal chief-of-staff assistant on Telegram.

PERSONALITY: Crisp, proactive, sharp. You anticipate needs. You are concise — a sentence or two, not paragraphs. You never pad replies with filler. You talk like a trusted operator, not a chatbot.

YOUR JOB: Read the user's message plus context, decide what actions to take, and reply naturally.

You MUST respond with a single JSON object, no other text:
{
  "reply": "your natural conversational reply to show the user",
  "actions": [
    {"type": "create_task", "title": "...", "deadline_text": "raw date words if any", "priority": "high|medium|low"},
    {"type": "create_expense", "amount": 0, "category": "food|travel|shopping|education|health|other", "description": "..."},
    {"type": "store_memory", "key": "...", "value": "..."},
    {"type": "complete_task", "match": "words that identify which task"},
    {"type": "delete_task", "match": "words that identify which task"},
    {"type": "ask_followup", "waiting_for": "short label for what you need", "partial": {"key": "captured so far"}}
  ]
}

RULES:
- "actions" can be empty if the user is just chatting or asking a question. Then just fill "reply".
- For tasks, always extract a clear title. Never use "Untitled Task".
- Keep deadline_text as the user's raw words ("Friday", "tomorrow 6pm") — the system parses it.
- Use memory and current data to give sharp, contextual replies. If they have overdue tasks, mention it.
- If the user asks about their tasks/expenses, answer from the CURRENT DATA provided, don't invent.
- Match tasks for complete/delete loosely by keywords from their message.
- Use ask_followup ONLY when you genuinely need one specific piece of information to act well (e.g. "plan my week" needs priorities, "set a budget" needs amounts). Do NOT ask follow-ups for simple requests you can handle directly. Never chain more than one follow-up at a time.
- When ACTIVE FOLLOW-UP context is present in the prompt, the user's message is their answer to your previous question — use that partial data plus their answer to complete the goal, do NOT ask again.`;

export class ConversationEngine {
  // --- Session helpers (Firestore: settings/session_{userId}) ---

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

  // --- Main entry point ---

  async process(userId, chatId, message) {
    // Fetch context + any pending follow-up session in parallel
    const [recentTurns, memories, tasks, expenseSummary, pendingSession] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      taskService.getUserTasks(userId, 'pending'),
      expenseService.getMonthlySummary(userId),
      this.getSession(userId)
    ]);

    // If there's an active follow-up, clear it now — executeActions will re-set
    // it if the LLM decides it needs another round, or leave it cleared if resolved.
    if (pendingSession) {
      await this.clearSession(userId);
    }

    const memoryBlock = this.selectMemories(memories, message)
      .map(m => `- ${m.key || m.category}: ${m.value}`).join('\n') || '(none yet)';

    const taskBlock = tasks.length
      ? tasks.map((t, i) => `${i + 1}. ${t.title}${t.deadline ? ` (due ${formatDate(t.deadline)})` : ''} [${t.priority}]`).join('\n')
      : '(no pending tasks)';

    const expenseBlock = Object.keys(expenseSummary).length
      ? Object.entries(expenseSummary).map(([c, a]) => `${c}: ₹${a}`).join(', ')
      : '(no expenses this month)';

    // Inject pending session context so the LLM knows it's receiving an answer
    const sessionBlock = pendingSession
      ? `\nACTIVE FOLLOW-UP:\nGoal: ${pendingSession.waiting_for}\nPartial data: ${JSON.stringify(pendingSession.partial || {})}\nThe user is now answering your question — use this to complete the goal.\n`
      : '';

    const contextMessage = `LONG-TERM MEMORY:\n${memoryBlock}\n\nCURRENT PENDING TASKS:\n${taskBlock}\n\nTHIS MONTH'S SPENDING:\n${expenseBlock}${sessionBlock}\n\nUSER MESSAGE: ${message}`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentTurns,
      { role: 'user', content: contextMessage }
    ];

    let raw;
    try {
      raw = await llm.chat(messages, 0.6);
    } catch (error) {
      logger.error('Conversation engine LLM failed', { error: error.message });
      return "Something glitched on my end. Try that again?";
    }

    const parsed = this.parseResponse(raw);

    await this.executeActions(userId, parsed.actions, tasks);

    await conversationMemory.addTurn(userId, 'user', message);
    await conversationMemory.addTurn(userId, 'assistant', parsed.reply);

    // Append any budget warnings surfaced during actions
    if (this._pendingWarnings && this._pendingWarnings.length) {
      parsed.reply += '\n\n' + this._pendingWarnings.join('\n');
      this._pendingWarnings = [];
    }

    return parsed.reply;
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

  async executeActions(userId, actions, currentTasks) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_task': {
            const deadline = parseDate(action.deadline_text);
            await taskService.create(userId, {
              title: action.title,
              date: deadline,
              priority: action.priority || 'medium'
            });
            break;
          }
          case 'create_expense': {
            await expenseService.create(userId, {
              amount: action.amount,
              category: action.category || 'other',
              description: action.description || ''
            });
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
          default:
            logger.debug('Unknown action type', { type: action.type });
        }
      } catch (error) {
        logger.error('Action execution failed', { action: action.type, error: error.message });
      }
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
    let best = null;
    let bestScore = 0;
    for (const t of tasks) {
      const title = (t.title || '').toLowerCase();
      const score = words.filter(w => w.length > 2 && title.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return bestScore > 0 ? best : null;
  }
}

export const conversationEngine = new ConversationEngine();
