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
          const result = await visionService.processPhoto(userId, largest.file_id);
          if (!result) {
            await telegramService.sendMessage(chatId, "Image received but I can't analyze images right now.");
          } else if (result.is_receipt) {
            const { expenseService } = await import('../expenses/expenseService.js');
            const { budgetService } = await import('../expenses/budgetService.js');
            await expenseService.create(userId, {
              amount: result.amount,
              category: result.category || 'other',
              description: result.items || '',
              merchant: result.merchant || 'Unknown'
            });
            const warning = await budgetService.checkBudgetWarning(userId, result.category || 'other');
            let msg = `📸 Receipt detected: Rs.${result.amount} at ${result.merchant || 'Unknown'} (${result.category || 'other'}). Logged.`;
            if (warning) msg += `\n\n${warning}`;
            await telegramService.sendMessage(chatId, msg);
          } else {
            const desc = result.description || 'something interesting';
            await telegramService.sendMessage(chatId, `I see ${desc}. What would you like me to do with this?`);
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
          await telegramService.sendMessage(chatId, response);
        }
        return { ok: true };
      }

      // ── Conversation brain ────────────────────────────────────────────────
      const reply = await conversationEngine.process(userId, chatId, message);

      // Quick action button (phone call, navigate, music, timer, web open, SMS)
      if (conversationEngine._quickAction) {
        const { label, url } = conversationEngine._quickAction;
        conversationEngine._quickAction = null;
        await telegramService.sendMessageWithButton(chatId, reply, label, url);
      // WhatsApp deep link embedded in reply text → send as tappable button
      } else {
        const waMatch = reply.match(/\n\n👉 \[Tap to send on WhatsApp\]\((https:\/\/wa\.me\/[^\)]+)\)/);
        if (waMatch) {
          const textPart = reply.slice(0, reply.indexOf('\n\n👉 [Tap to send on WhatsApp]')).trim();
          await telegramService.sendMessageWithButton(chatId, textPart || reply, '👉 Send on WhatsApp', waMatch[1]);
        } else {
          await telegramService.sendMessage(chatId, reply);
        }
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
