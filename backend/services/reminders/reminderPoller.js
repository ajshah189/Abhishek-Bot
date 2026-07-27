import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { telegramService } from '../telegram/telegramService.js';
import { reminderService } from './reminderService.js';

export class ReminderPoller {
  constructor(intervalMs = 60000) {
    this.intervalMs = intervalMs;
    this.pollingInterval = null;
  }

  start() {
    logger.info('Reminder poller started', { interval: this.intervalMs });

    this.pollingInterval = setInterval(async () => {
      await this.checkAndSendReminders();
    }, this.intervalMs);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      logger.info('Reminder poller stopped');
    }
  }

  async checkAndSendReminders() {
    try {
      const now = new Date();
      const usersSnapshot = await db.collection('users').get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const remindersSnapshot = await db
          .collection('reminders')
          .where('userId', '==', userId)
          .where('status', '==', 'pending')
          .where('reminderTime', '<=', now)
          .get();

        for (const reminderDoc of remindersSnapshot.docs) {
          const reminder = reminderDoc.data();
          await this.sendReminder(userId, reminder);
          await reminderService.markAsSent(reminder.id);
        }
      }
    } catch (error) {
      logger.error('Reminder polling failed', { error: error.message });
    }
  }

  async sendReminder(userId, reminder) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const chatId = userDoc.data().telegramId;

      const message = `⏰ ${reminder.title}\n${reminder.description || ''}`;
      await telegramService.sendMessage(chatId, message);

      logger.info('Reminder sent', { userId, reminderId: reminder.id });
    } catch (error) {
      logger.error('Failed to send reminder', { error: error.message });
    }
  }
}

export const reminderPoller = new ReminderPoller(60000);
