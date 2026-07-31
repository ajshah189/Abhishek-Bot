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
    logger.info('Reminder poller started', { intervalMs: this.intervalMs });
    this.pollingInterval = setInterval(() => {
      // Fire and forget — errors are caught inside, never propagate to setInterval
      this.tick().catch(err => {
        logger.error('Poller tick threw unexpectedly', { error: err.message });
      });
    }, this.intervalMs);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info('Reminder poller stopped');
    }
  }

  async tick() {
    // Run all checks in parallel; each has its own try/catch
    const { staleTaskChecker } = await import('../tasks/staleTaskChecker.js');
    await Promise.all([
      this.checkAndSendReminders(),
      this.nudgeUpcomingDeadlines(),
      staleTaskChecker.check()
    ]);
  }

  async checkAndSendReminders() {
    try {
      const now = new Date();
      const usersSnap = await db.collection('users').get();

      for (const userDoc of usersSnap.docs) {
        try {
          const userId = userDoc.id;
          const remindersSnap = await db
            .collection('reminders')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .where('reminderTime', '<=', now)
            .get();

          for (const reminderDoc of remindersSnap.docs) {
            try {
              const reminder = reminderDoc.data();
              await this.sendReminder(userId, reminder);
              await reminderService.markAsSent(reminder.id);
            } catch (err) {
              logger.error('Failed to process reminder', { reminderId: reminderDoc.id, error: err.message });
            }
          }
        } catch (err) {
          logger.error('Failed to process user reminders', { userId: userDoc.id, error: err.message });
        }
      }
    } catch (err) {
      logger.error('checkAndSendReminders failed', { error: err.message });
    }
  }

  async nudgeUpcomingDeadlines() {
    try {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const usersSnap = await db.collection('users').get();

      for (const userDoc of usersSnap.docs) {
        try {
          const userId = userDoc.id;
          const chatId = userDoc.data().telegramId;
          if (!chatId) continue;

          const tasksSnap = await db
            .collection('tasks')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .where('deadline', '>=', now)
            .where('deadline', '<=', in24h)
            .get();

          for (const taskDoc of tasksSnap.docs) {
            try {
              const task = taskDoc.data();
              if (task.nudgedAt) continue; // already nudged

              const deadline = task.deadline?.toDate ? task.deadline.toDate() : new Date(task.deadline);
              const hoursLeft = Math.round((deadline - now) / (1000 * 60 * 60));
              const timeStr = hoursLeft <= 1 ? 'in under an hour' : `in ~${hoursLeft}h`;

              await telegramService.sendMessage(
                chatId,
                `⏳ Heads up — *${task.title}* is due ${timeStr}.`
              );

              await db.collection('tasks').doc(task.id).update({ nudgedAt: now });
              logger.info('Deadline nudge sent', { taskId: task.id, hoursLeft });
            } catch (err) {
              logger.error('Failed to nudge task', { taskId: taskDoc.id, error: err.message });
            }
          }
        } catch (err) {
          logger.error('Failed to nudge user deadlines', { userId: userDoc.id, error: err.message });
        }
      }
    } catch (err) {
      logger.error('nudgeUpcomingDeadlines failed', { error: err.message });
    }
  }

  async sendReminder(userId, reminder) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const chatId = userDoc.data()?.telegramId;
      if (!chatId) return;

      const message = `⏰ *${reminder.title}*${reminder.description ? `\n${reminder.description}` : ''}`;
      await telegramService.sendMessage(chatId, message);
      logger.info('Reminder sent', { userId, reminderId: reminder.id });
    } catch (err) {
      logger.error('Failed to send reminder', { error: err.message });
    }
  }
}

export const reminderPoller = new ReminderPoller(60000);
