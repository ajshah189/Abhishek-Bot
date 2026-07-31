import { db } from '../../config/firebase.js';
import { telegramService } from '../telegram/telegramService.js';
import { logger } from '../../utils/logger.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS    = 24 * 60 * 60 * 1000;

export class StaleTaskChecker {
  async check() {
    try {
      const usersSnap = await db.collection('users').get();
      await Promise.all(usersSnap.docs.map(async userDoc => {
        try {
          const chatId = userDoc.data()?.telegramId;
          if (!chatId) return;
          await this.checkForUser(userDoc.id, chatId, new Date());
        } catch (err) {
          logger.error('staleTaskChecker: user error', { userId: userDoc.id, error: err.message });
        }
      }));
    } catch (err) {
      logger.error('staleTaskChecker.check failed', { error: err.message });
    }
  }

  async checkForUser(userId, chatId, now) {
    const pendingSnap = await db.collection('tasks')
      .where('userId', '==', userId.toString())
      .where('status', '==', 'pending')
      .get();

    for (const taskDoc of pendingSnap.docs) {
      const task = taskDoc.data();
      if (task.staleNudgedAt) continue; // already nudged once

      const createdAt = task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt || 0);
      const ageMs = now.getTime() - createdAt.getTime();

      let isStale = false;
      let ageDescription = '';

      if (!task.deadline && ageMs > THREE_DAYS_MS) {
        const days = Math.floor(ageMs / ONE_DAY_MS);
        isStale = true;
        ageDescription = `${days} days ago`;
      } else if (task.deadline) {
        const deadline = task.deadline?.toDate ? task.deadline.toDate() : new Date(task.deadline);
        const overdueMs = now.getTime() - deadline.getTime();
        if (overdueMs > ONE_DAY_MS) {
          const days = Math.floor(overdueMs / ONE_DAY_MS);
          isStale = true;
          ageDescription = `${days} day${days !== 1 ? 's' : ''} overdue`;
        }
      }

      if (!isStale) continue;

      try {
        await telegramService.sendMessage(
          chatId,
          `🔔 You added *"${task.title}"* ${ageDescription} — still relevant, or should I remove it?\n\nReply "remove it" or "not relevant" to delete.`
        );
        await db.collection('tasks').doc(taskDoc.id).update({ staleNudgedAt: now });
        logger.info('Stale task nudge sent', { userId, taskId: taskDoc.id });
      } catch (err) {
        logger.error('staleTaskChecker: nudge failed', { taskId: taskDoc.id, error: err.message });
      }
    }
  }
}

export const staleTaskChecker = new StaleTaskChecker();
