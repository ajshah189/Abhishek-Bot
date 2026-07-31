import axios from 'axios';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { extractUserMessage, extractUserId, extractChatId } from '../../utils/validators.js';
import { telegramService } from './telegramService.js';
import { commandHandler } from './commandHandler.js';
import { conversationEngine } from '../ai/conversationEngine.js';

async function downloadTelegramImage(fileId) {
  const apiBase = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  const fileRes = await axios.get(`${apiBase}/getFile`, { params: { file_id: fileId } });
  const filePath = fileRes.data.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const res = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
  return Buffer.from(res.data).toString('base64');
}

export class TelegramHandler {
  async handleUpdate(update) {
    try {
      // ── Callback queries (inline button taps) ────────────────────────────
      if (update.callback_query) {
        const { id: callbackId, from, data } = update.callback_query;
        const callbackUserId = from.id.toString();
        const [action, itemId] = (data || '').split(':');
        try {
          switch (action) {
            case 'complete_task': {
              const { taskService } = await import('../tasks/taskService.js');
              await taskService.updateStatus(itemId, 'completed');
              await telegramService.answerCallbackQuery(callbackId, '✅ Task completed!');
              break;
            }
            case 'delete_task': {
              const { taskService } = await import('../tasks/taskService.js');
              await taskService.delete(itemId);
              await telegramService.answerCallbackQuery(callbackId, '🗑️ Task deleted!');
              break;
            }
            case 'complete_habit': {
              const { habitService } = await import('../habits/habitService.js');
              await habitService.markComplete(itemId);
              await telegramService.answerCallbackQuery(callbackId, '✅ Habit marked done!');
              break;
            }
            default:
              await telegramService.answerCallbackQuery(callbackId, 'Unknown action');
          }
        } catch (err) {
          logger.error('Callback query failed', { action, itemId, error: err.message });
          await telegramService.answerCallbackQuery(callbackId, 'Action failed');
        }
        return { ok: true };
      }

      const userId = extractUserId(update);
      const chatId = extractChatId(update);

      // Fix 2 — owner gate: silently ignore messages from anyone else
      const ownerId = process.env.OWNER_TELEGRAM_ID;
      if (ownerId && userId?.toString() !== ownerId.toString()) {
        return { ok: true };
      }
      let message = extractUserMessage(update);

      // ── Voice notes: transcribe → treat as text ───────────────────────────
      if (!message && update.message?.voice) {
        await telegramService.sendMessage(chatId, '🎤 Listening...');
        const { voiceTranscriber } = await import('../voice/voiceTranscriber.js');
        message = await voiceTranscriber.transcribeTelegramVoice(update.message.voice.file_id);
        if (!message) {
          await telegramService.sendMessage(chatId, "Couldn't catch that — try again?");
          return { ok: true };
        }
      }

      if (!userId || !chatId) return { ok: true };

      await this.ensureUser(userId, update);

      // ── PDF documents ─────────────────────────────────────────────────────
      if (update.message?.document?.mime_type === 'application/pdf') {
        const doc = update.message.document;
        await telegramService.sendMessage(chatId, '📄 Reading your PDF...');
        try {
          const { pdfService } = await import('../documents/pdfService.js');
          const result = await pdfService.processUpload(userId, doc.file_id, doc.file_name);
          if (result.error) {
            await telegramService.sendMessage(chatId, result.message);
          } else {
            await telegramService.sendMessage(
              chatId,
              `📄 ${result.filename}\n\n${result.summary}\n\nAsk me anything about this document.`
            );
          }
        } catch (err) {
          logger.error('PDF processing failed', { error: err.message });
          await telegramService.sendMessage(chatId, "Couldn't read that PDF — try a text-based one (scanned PDFs aren't supported yet).");
        }
        return { ok: true };
      }

      // ── Photos / receipts ─────────────────────────────────────────────────
      if (update.message?.photo) {
        const largest = update.message.photo[update.message.photo.length - 1];
        await telegramService.sendMessage(chatId, '📸 Analyzing image...');
        try {
          const { visionService } = await import('../ai/visionService.js');
          const base64 = await downloadTelegramImage(largest.file_id);
          const result = await visionService.analyzeImage(base64, 'image/jpeg');
          if (!result) {
            await telegramService.sendMessage(chatId, "Image received but I can't analyze images right now.");
          } else if (result.is_receipt) {
            const amount = result.amount || 0;
            const category = result.category || 'other';
            const merchant = result.merchant || 'Unknown';
            const items = result.items || '';
            // Let the conversation engine handle expense creation via natural language
            const syntheticMsg = `Add expense ${amount} ${category} at ${merchant}${items ? ' — ' + items : ''}`;
            await conversationEngine.process(userId, chatId, syntheticMsg);
            await telegramService.sendMessage(chatId, `📸 Receipt scanned: ₹${amount} at ${merchant} (${category})`);
          } else {
            const desc = result.description || 'something interesting';
            await telegramService.sendMessage(chatId, `I see: ${desc}`);
          }
        } catch (err) {
          logger.error('Photo processing failed', { error: err.message });
          await telegramService.sendMessage(chatId, "Image received but I can't analyze images right now.");
        }
        return { ok: true };
      }

      if (!message) return { ok: true };

      // ── Slash commands ────────────────────────────────────────────────────
      if (message.startsWith('/')) {
        const [command, ...args] = message.split(' ');
        const response = await commandHandler.handle(userId, chatId, command, args);
        if (response !== null && response !== undefined) {
          // Check if the response includes inline keyboard buttons
          if (typeof response === 'object' && response.text && response.keyboard) {
            await telegramService.sendMessageWithInlineKeyboard(chatId, response.text, response.keyboard);
          } else {
            await telegramService.sendMessage(chatId, response);
          }
        }
        return { ok: true };
      }

      // ── Conversation brain ────────────────────────────────────────────────
      const result = await conversationEngine.process(userId, chatId, message);
      const { reply, quickAction, whatsappLink } = typeof result === 'string'
        ? { reply: result, quickAction: null, whatsappLink: null }
        : result;

      if (quickAction) {
        await telegramService.sendMessageWithButton(chatId, reply, quickAction.label, quickAction.url);
      } else if (whatsappLink) {
        await telegramService.sendMessageWithButton(chatId, reply, '👉 Send on WhatsApp', whatsappLink.url);
      } else {
        await telegramService.sendMessage(chatId, reply);
      }

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
