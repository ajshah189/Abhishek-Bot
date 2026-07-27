import { logger } from '../../utils/logger.js';
import { telegramService } from '../telegram/telegramService.js';
import { plannerService } from '../planner/plannerService.js';

export class ScheduleService {
  constructor() {
    this.schedules = new Map();
  }

  async initializeDailyPlanner(userId, chatId, time = '08:00') {
    try {
      const [hours, minutes] = time.split(':').map(Number);
      this.scheduleDaily(userId, chatId, hours, minutes, async () => {
        const brief = await plannerService.getDailyBrief(userId);
        if (brief) {
          await telegramService.sendMessage(chatId, this.formatDailyBrief(brief));
        }
      });

      logger.info('Daily planner scheduled', { userId, time });
    } catch (error) {
      logger.error('Failed to schedule daily planner', { error: error.message });
    }
  }

  async initializeEveningReview(userId, chatId, time = '21:00') {
    try {
      const [hours, minutes] = time.split(':').map(Number);
      this.scheduleDaily(userId, chatId, hours, minutes, async () => {
        const review = await plannerService.getEveningReview(userId);
        if (review) {
          await telegramService.sendMessage(chatId, this.formatEveningReview(review));
        }
      });

      logger.info('Evening review scheduled', { userId, time });
    } catch (error) {
      logger.error('Failed to schedule evening review', { error: error.message });
    }
  }

  scheduleDaily(userId, chatId, hours, minutes, callback) {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime.getTime() - now.getTime();
    const key = `${userId}-${hours}-${minutes}`;

    if (this.schedules.has(key)) {
      clearTimeout(this.schedules.get(key));
    }

    this.schedules.set(key, setTimeout(async () => {
      await callback();
      this.scheduleDaily(userId, chatId, hours, minutes, callback);
    }, delay));

    logger.info('Task scheduled', { userId, key, delayMs: delay });
  }

  cancel(userId, hours, minutes) {
    const key = `${userId}-${hours}-${minutes}`;
    if (this.schedules.has(key)) {
      clearTimeout(this.schedules.get(key));
      this.schedules.delete(key);
      logger.info('Schedule cancelled', { key });
    }
  }

  formatDailyBrief(brief) {
    let message = `${brief.greeting}\n\n`;
    message += `📋 Today's Tasks: ${brief.taskCount}\n`;
    message += `💡 ${brief.focus}\n\n`;
    message += `Type /tasks to see all pending tasks.`;
    return message;
  }

  formatEveningReview(review) {
    let message = `${review.greeting}\n\n`;
    message += `✅ Completed: ${review.completedCount}\n`;
    message += `📝 Pending: ${review.pendingCount}\n\n`;
    message += `Great work today! Keep it up tomorrow.`;
    return message;
  }
}

export const scheduleService = new ScheduleService();
