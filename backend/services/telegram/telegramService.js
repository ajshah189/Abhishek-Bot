import axios from 'axios';
import { getTelegramApiUrl } from '../../config/telegram.js';
import { logger } from '../../utils/logger.js';

function escapeMarkdownV2(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function formatMarkdownV2(text) {
  if (!text) return '';
  return escapeMarkdownV2(text);
}

export class TelegramService {
  async sendMessage(chatId, text, options = {}) {
    try {
      return await axios.post(getTelegramApiUrl('sendMessage'), {
        chat_id: chatId,
        text: formatMarkdownV2(text),
        parse_mode: 'MarkdownV2',
        ...options
      });
    } catch (error) {
      // Fallback to plain text if MarkdownV2 formatting fails
      try {
        return await axios.post(getTelegramApiUrl('sendMessage'), {
          chat_id: chatId,
          text,
          ...options
        });
      } catch (e) {
        logger.error('sendMessage failed', { chatId, error: e.message });
      }
    }
  }

  async sendMessageWithButton(chatId, text, buttonText, buttonUrl) {
    try {
      const response = await axios.post(getTelegramApiUrl('sendMessage'), {
        chat_id: chatId,
        text,
        reply_markup: {
          inline_keyboard: [[{ text: buttonText, url: buttonUrl }]]
        }
      });
      return response.data;
    } catch (error) {
      try {
        const response = await axios.post(getTelegramApiUrl('sendMessage'), {
          chat_id: chatId,
          text,
          reply_markup: {
            inline_keyboard: [[{ text: buttonText, url: buttonUrl }]]
          }
        });
        return response.data;
      } catch (e) {
        logger.error('Failed to send message with button', { error: e.message, chatId });
      }
    }
  }

  async sendMessageWithInlineKeyboard(chatId, text, keyboard) {
    try {
      return await axios.post(getTelegramApiUrl('sendMessage'), {
        chat_id: chatId,
        text: formatMarkdownV2(text),
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch {
      return await axios.post(getTelegramApiUrl('sendMessage'), {
        chat_id: chatId,
        text,
        reply_markup: { inline_keyboard: keyboard }
      });
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

  async sendContactVCF(chatId, name, phone, email = '') {
    try {
      const dialCode = phone && phone.length === 10 ? `+91${phone}` : phone ? `+${phone}` : '';
      const vcf = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        dialCode ? `TEL;TYPE=CELL:${dialCode}` : null,
        email ? `EMAIL:${email}` : null,
        'END:VCARD'
      ].filter(Boolean).join('\r\n');

      const filename = `${name.replace(/\s+/g, '_')}.vcf`;
      const blob = new Blob([vcf], { type: 'text/vcard' });

      const form = new FormData();
      form.append('chat_id', chatId.toString());
      form.append('caption', '📱 Tap to save to your phone');
      form.append('document', blob, filename);

      const response = await axios.post(getTelegramApiUrl('sendDocument'), form, {
        headers: form.headers ? form.headers : {}
      });

      logger.info('VCF contact sent', { chatId, name });
      return response.data;
    } catch (error) {
      logger.error('Failed to send VCF', { error: error.message, chatId });
      throw error;
    }
  }
}

export const telegramService = new TelegramService();
