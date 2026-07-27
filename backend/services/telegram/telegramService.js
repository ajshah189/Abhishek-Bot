import axios from 'axios';
import { getTelegramApiUrl } from '../../config/telegram.js';
import { logger } from '../../utils/logger.js';

export class TelegramService {
  async sendMessage(chatId, text) {
    try {
      const response = await axios.post(getTelegramApiUrl('sendMessage'), {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      });

      logger.info('Message sent', { chatId, messageLength: text.length });
      return response.data;
    } catch (error) {
      logger.error('Failed to send message', { error: error.message, chatId });
      throw error;
    }
  }

  async sendDocument(chatId, fileId, caption = '') {
    try {
      const response = await axios.post(getTelegramApiUrl('sendDocument'), {
        chat_id: chatId,
        document: fileId,
        caption
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send document', { error: error.message });
      throw error;
    }
  }

  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    try {
      return await axios.post(getTelegramApiUrl('answerCallbackQuery'), {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      });
    } catch (error) {
      logger.error('Failed to answer callback', { error: error.message });
      throw error;
    }
  }
}

export const telegramService = new TelegramService();
