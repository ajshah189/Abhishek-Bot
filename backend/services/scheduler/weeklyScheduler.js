import { analyticsService } from '../analytics/analyticsService.js';
import { logger } from '../../utils/logger.js';
import { db } from '../../config/firebase.js';

export class WeeklyScheduler {
  constructor() {
    this.weeklySchedules = new Map();
  }

  async initializeWeeklyReports() {
    try {
      const usersSnapshot = await db.collection('users').get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const user = userDoc.data();
        const chatId = user.telegramId;

        this.scheduleWeeklyReport(userId, chatId);
      }

      logger.info('Weekly reports initialized', { count: usersSnapshot.size });
    } catch (error) {
      logger.error('Failed to initialize weekly reports', { error: error.message });
    }
  }

  scheduleWeeklyReport(userId, chatId, dayOfWeek = 0, time = '10:00') {
    const [hours, minutes] = time.split(':').map(Number);

    const scheduleNextReport = () => {
      const now = new Date();
      const nextReport = new Date();

      nextReport.setDate(nextReport.getDate() + ((dayOfWeek + 7 - now.getDay()) % 7 || 7));
      nextReport.setHours(hours, minutes, 0, 0);

      if (nextReport < now) {
        nextReport.setDate(nextReport.getDate() + 7);
      }

      const delay = nextReport.getTime() - now.getTime();
      const key = `${userId}-weekly-report`;

      if (this.weeklySchedules.has(key)) {
        clearTimeout(this.weeklySchedules.get(key));
      }

      this.weeklySchedules.set(key, setTimeout(async () => {
        await analyticsService.generateWeeklyReport(userId, chatId);
        // Run pattern analysis after the weekly report
        try {
          const { patternAnalyzer } = await import('../analytics/patternAnalyzer.js');
          await patternAnalyzer.analyzePatterns(userId);
        } catch (err) {
          logger.error('Pattern analysis after weekly report failed', { userId, error: err.message });
        }
        scheduleNextReport();
      }, delay));

      logger.info('Weekly report scheduled', { userId, key, delayMs: delay });
    };

    scheduleNextReport();
  }
}

export const weeklyScheduler = new WeeklyScheduler();
