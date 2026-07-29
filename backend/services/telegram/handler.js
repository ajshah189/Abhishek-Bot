import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { extractUserMessage, extractUserId, extractChatId } from '../../utils/validators.js';
import { telegramService } from './telegramService.js';
import { commandHandler } from './commandHandler.js';
import { conversationEngine } from '../ai/conversationEngine.js';

export class TelegramHandler {
  async handleUpdate(update) {
    try {
      const userId = extractUserId(update);
      const chatId = extractChatId(update);
      const message = extractUserMessage(update);

      if (!userId || !chatId || !message) {
        return { ok: true };
      }

      await this.ensureUser(userId, update);

      // Slash commands go to the command handler
      if (message.startsWith('/')) {
        const [command, ...args] = message.split(' ');
        const response = await commandHandler.handle(userId, chatId, command, args);
        await telegramService.sendMessage(chatId, response);
        return { ok: true };
      }

      // Everything else goes through the conversation brain
      const reply = await conversationEngine.process(userId, chatId, message);
      await telegramService.sendMessage(chatId, reply);

      return { ok: true };
    } catch (error) {
      logger.error('Error handling update', { error: error.message });
      return { ok: false, error: error.message };
    }
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
}

export const telegramHandler = new TelegramHandler();
