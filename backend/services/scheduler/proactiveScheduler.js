import cron from 'node-cron';
import { db } from '../../config/firebase.js';
import { plannerService } from '../planner/plannerService.js';
import { logger } from '../../utils/logger.js';

export class ProactiveScheduler {
  constructor() {
    this.jobs = [];
  }

  async start() {
    try {
      const snap = await db.collection('users').get();
      for (const doc of snap.docs) {
        try {
          const user = doc.data();
          const chatId = user.telegramId;
          if (!chatId) continue;
          this.scheduleForUser(doc.id, chatId, user.settings);
        } catch (err) {
          logger.error('Failed to schedule user', { userId: doc.id, error: err.message });
        }
      }

      // ── Daily backup at 11:55 PM IST for owner ──────────────────────────
      const backupJob = cron.schedule('55 23 * * *', async () => {
        try {
          const { backupService } = await import('../backup/backupService.js');
          const ownerId = process.env.OWNER_TELEGRAM_ID;
          if (ownerId) await backupService.createBackup(ownerId);
        } catch (err) {
          logger.error('Nightly backup error', { error: err.message });
        }
      }, { timezone: 'Asia/Kolkata' });
      this.jobs.push(backupJob);

      // ── Daily summary at 11:59 PM IST for owner ─────────────────────────
      const summaryJob = cron.schedule('59 23 * * *', async () => {
        try {
          const { dailySummarizer } = await import('../memory/dailySummarizer.js');
          const ownerId = process.env.OWNER_TELEGRAM_ID;
          if (ownerId) await dailySummarizer.summarizeDay(ownerId);
        } catch (err) {
          logger.error('Daily summary error', { error: err.message });
        }
      }, { timezone: 'Asia/Kolkata' });
      this.jobs.push(summaryJob);

      logger.info('Proactive scheduler started', { users: snap.size });
    } catch (err) {
      logger.error('Proactive scheduler init failed', { error: err.message });
    }
  }

  scheduleForUser(userId, chatId, settings = {}) {
    const dailyTime = settings?.dailyPlannerTime || '08:00';
    const eveningTime = settings?.eveningReviewTime || '21:00';

    const [dH, dM] = dailyTime.split(':').map(Number);
    const [eH, eM] = eveningTime.split(':').map(Number);

    const tz = { timezone: 'Asia/Kolkata' };

    const morningJob = cron.schedule(`${dM} ${dH} * * *`, async () => {
      try {
        await plannerService.sendMorningBrief(userId, chatId);
      } catch (err) {
        logger.error('Morning brief error', { userId, error: err.message });
      }
    }, tz);

    const eveningJob = cron.schedule(`${eM} ${eH} * * *`, async () => {
      try {
        await plannerService.sendEveningReview(userId, chatId);
      } catch (err) {
        logger.error('Evening review error', { userId, error: err.message });
      }
    }, tz);

    this.jobs.push(morningJob, eveningJob);
    logger.info('Scheduled briefs for user', { userId, dailyTime, eveningTime });
  }

  stop() {
    this.jobs.forEach(j => j.stop());
    this.jobs = [];
  }
}

export const proactiveScheduler = new ProactiveScheduler();
