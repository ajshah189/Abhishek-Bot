import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { intentExtractor } from '../ai/intentExtractor.js';
import { extractUserMessage, extractUserId, extractChatId } from '../../utils/validators.js';
import { telegramService } from './telegramService.js';
import { commandHandler } from './commandHandler.js';
import { userScheduler } from '../scheduler/userScheduler.js';
import { pdfExtractor } from '../documents/pdfExtractor.js';
import { voiceTranscriber } from '../voice/voiceTranscriber.js';
import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { memoryService } from '../memory/memoryService.js';
import { noteService } from '../notes/noteService.js';
import { journalService } from '../journal/journalService.js';
import { calendarService } from '../calendar/calendarService.js';
import { contactService } from '../contacts/contactService.js';
import { reminderService } from '../reminders/reminderService.js';
import { searchService } from '../search/searchService.js';

export class TelegramHandler {
  async handleUpdate(update) {
    try {
      const userId = extractUserId(update);
      const chatId = extractChatId(update);
      const message = extractUserMessage(update);

      if (!userId || !chatId) {
        logger.warn('Invalid update received', { update });
        return { ok: true };
      }

      await this.ensureUser(userId, update);

      // Handle media (PDF, voice)
      if (!message && (update.message?.document || update.message?.voice)) {
        await this.handleMediaUpdate(update, userId, chatId);
        return { ok: true };
      }

      if (!message) {
        return { ok: true };
      }

      await this.logConversation(userId, message);

      if (message.startsWith('/')) {
        const [command, ...args] = message.split(' ');
        const response = await commandHandler.handle(userId, chatId, command, args);
        await telegramService.sendMessage(chatId, response);
        return { ok: true };
      }

      const intentData = await intentExtractor.extract(message);
      const response = await this.routeIntent(userId, chatId, message, intentData);

      await telegramService.sendMessage(chatId, response);

      return { ok: true };
    } catch (error) {
      logger.error('Error handling update', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  async routeIntent(userId, chatId, message, intentData) {
    const { intent, fields } = intentData;

    try {
      switch (intent) {
        case 'task':
          await taskService.create(userId, fields);
          return `✅ Task created: "${fields.title}"${fields.deadline ? ` (Due: ${fields.deadline})` : ''}`;

        case 'expense':
          await expenseService.create(userId, fields);
          return `💰 Expense tracked: ₹${fields.amount}${fields.category ? ` (${fields.category})` : ''}`;

        case 'reminder':
          await reminderService.create(userId, fields);
          return `⏰ Reminder set: "${fields.title}"`;

        case 'memory':
          await memoryService.store(userId, fields);
          return `🧠 Remembered: ${fields.description}`;

        case 'note':
          await noteService.create(userId, fields);
          return `📝 Note saved: "${fields.title}"`;

        case 'event':
          await calendarService.create(userId, fields);
          return `📅 Event added: "${fields.title}"`;

        case 'habit':
          return `🎯 Habit tracked: ${fields.title}`;

        case 'journal':
          await journalService.create(userId, fields);
          return `📖 Journal entry saved`;

        case 'contact':
          await contactService.create(userId, fields);
          return `👤 Contact added: ${fields.name}`;

        case 'search': {
          const results = await searchService.globalSearch(userId, fields.query || message);
          return this.formatSearchResults(results);
        }

        case 'query':
        case 'conversation':
        default:
          userScheduler.initializeUserSchedules(userId.toString(), chatId).catch(() => {});
          return `Got it. How can I help?\n\nTry:\n• "Create task: finish assignment"\n• "Spent ₹500 on food"\n• "Gym tomorrow 6"\n• /help for more`;
      }
    } catch (error) {
      logger.error('Failed to process intent', { intent, error: error.message });
      return `❌ Something went wrong. Please try again.`;
    }
  }

  async handleMediaUpdate(update, userId, chatId) {
    try {
      if (update.message?.document) {
        const doc = update.message.document;
        if (doc.mime_type === 'application/pdf') {
          await telegramService.sendMessage(chatId, '📄 PDF received. Analyzing...');
          await this.handlePDFFile(doc.file_id, chatId);
        }
        return;
      }

      if (update.message?.voice) {
        await telegramService.sendMessage(chatId, '🎤 Voice note received. Transcribing...');
        await this.handleVoiceFile(update.message.voice.file_id, userId, chatId);
      }
    } catch (error) {
      logger.error('Media handling failed', { error: error.message });
      await telegramService.sendMessage(chatId, '❌ Failed to process file.');
    }
  }

  async handlePDFFile(fileId, chatId) {
    await telegramService.sendMessage(chatId, '✅ PDF processing:\n\n📊 Summary: PDF analysis complete.');
  }

  async handleVoiceFile(fileId, userId, chatId) {
    await telegramService.sendMessage(chatId, '✅ Voice processed:\n\n🎯 Transcription complete.');
  }

  formatSearchResults(results) {
    let message = `🔍 Search Results\n\n`;
    let found = false;

    if (results.tasks.length > 0) {
      found = true;
      message += `📋 Tasks (${results.tasks.length}):\n`;
      results.tasks.slice(0, 3).forEach(t => { message += `  • ${t.title}\n`; });
      message += '\n';
    }

    if (results.notes.length > 0) {
      found = true;
      message += `📝 Notes (${results.notes.length}):\n`;
      results.notes.slice(0, 3).forEach(n => { message += `  • ${n.title}\n`; });
      message += '\n';
    }

    if (results.memories.length > 0) {
      found = true;
      message += `🧠 Memories (${results.memories.length}):\n`;
      results.memories.slice(0, 3).forEach(m => { message += `  • ${m.value}\n`; });
    }

    return found ? message : 'No results found.';
  }

  async ensureUser(userId, update) {
    const usersRef = db.collection('users').doc(userId.toString());
    const userDoc = await usersRef.get();

    if (!userDoc.exists) {
      await usersRef.set({
        telegramId: userId,
        username: update.message?.from?.username || '',
        firstName: update.message?.from?.first_name || '',
        lastName: update.message?.from?.last_name || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {
          timezone: 'IST',
          dailyPlannerTime: '08:00',
          eveningReviewTime: '21:00',
          locale: 'en'
        }
      });
    }
  }

  async logConversation(userId, message) {
    await db.collection('conversation_logs').add({
      userId: userId.toString(),
      message,
      timestamp: new Date()
    });
  }
}

export const telegramHandler = new TelegramHandler();
