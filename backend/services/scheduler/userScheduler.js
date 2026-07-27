import { db } from '../../config/firebase.js';
import { scheduleService } from './scheduleService.js';
import { logger } from '../../utils/logger.js';

export class UserScheduler {
  async initializeUserSchedules(userId, chatId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const user = userDoc.data();

      if (!user) {
        logger.warn('User not found', { userId });
        return;
      }

      const dailyTime = user.settings?.dailyPlannerTime || '08:00';
      const eveningTime = user.settings?.eveningReviewTime || '21:00';

      await scheduleService.initializeDailyPlanner(userId, chatId, dailyTime);
      await scheduleService.initializeEveningReview(userId, chatId, eveningTime);

      logger.info('User schedules initialized', { userId, dailyTime, eveningTime });
    } catch (error) {
      logger.error('Failed to initialize user schedules', { error: error.message });
    }
  }

  async updateUserSchedule(userId, scheduleType, time) {
    try {
      await db.collection('users').doc(userId).update({
        [`settings.${scheduleType === 'daily' ? 'dailyPlannerTime' : 'eveningReviewTime'}`]: time
      });

      logger.info('User schedule updated', { userId, scheduleType, time });
      return true;
    } catch (error) {
      logger.error('Failed to update user schedule', { error: error.message });
      throw error;
    }
  }
}

export const userScheduler = new UserScheduler();
