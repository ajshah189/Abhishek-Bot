import { config } from 'dotenv';
config();

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
    {"type": "delete_task", "match": "words that identify which task"}
  ]
}

RULES:
- "actions" can be empty if the user is just chatting or asking a question. Then just fill "reply".
- For tasks, always extract a clear title. Never use "Untitled Task".
- Keep deadline_text as the user's raw words ("Friday", "tomorrow 6pm") — the system parses it.
- Use memory and current data to give sharp, contextual replies. If they have overdue tasks, mention it.
- If the user asks about their tasks/expenses, answer from the CURRENT DATA provided, don't invent.
- Match tasks for complete/delete loosely by keywords from their message.`;

export class ConversationEngine {
  async process(userId, chatId, message) {
    const [recentTurns, memories, tasks, expenseSummary] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      taskService.getUserTasks(userId, 'pending'),
      expenseService.getMonthlySummary(userId)
    ]);

    const memoryBlock = memories.length
      ? memories.map(m => `- ${m.key || m.category}: ${m.value}`).join('\n')
      : '(none yet)';

    const taskBlock = tasks.length
      ? tasks.map((t, i) => `${i + 1}. ${t.title}${t.deadline ? ` (due ${formatDate(t.deadline)})` : ''} [${t.priority}]`).join('\n')
      : '(no pending tasks)';

    const expenseBlock = Object.keys(expenseSummary).length
      ? Object.entries(expenseSummary).map(([c, a]) => `${c}: ₹${a}`).join(', ')
      : '(no expenses this month)';

    const contextMessage = `LONG-TERM MEMORY:\n${memoryBlock}\n\nCURRENT PENDING TASKS:\n${taskBlock}\n\nTHIS MONTH'S SPENDING:\n${expenseBlock}\n\nUSER MESSAGE: ${message}`;

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
          default:
            logger.debug('Unknown action type', { type: action.type });
        }
      } catch (error) {
        logger.error('Action execution failed', { action: action.type, error: error.message });
      }
    }
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
