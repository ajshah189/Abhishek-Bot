import { taskService } from '../tasks/taskService.js';
import { logger } from '../../utils/logger.js';

export class PlannerService {
  async getDailyBrief(userId) {
    try {
      const tasks = await taskService.getUserTasks(userId, 'pending');
      const todaysTasks = tasks.filter(t => this.isToday(t.deadline));

      return {
        greeting: '🌅 Good morning, Abhishek!',
        tasks: todaysTasks,
        taskCount: todaysTasks.length,
        focus: this.suggestFocus(todaysTasks),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to generate daily brief', { error: error.message });
      return null;
    }
  }

  async getEveningReview(userId) {
    try {
      const allTasks = await taskService.getUserTasks(userId, 'pending');
      const completedTasks = await taskService.getUserTasks(userId, 'completed');

      return {
        greeting: '📊 Evening Review',
        completedCount: completedTasks.length,
        completedTasks: completedTasks.slice(0, 5),
        pendingCount: allTasks.length,
        pendingTasks: allTasks.slice(0, 5),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to generate evening review', { error: error.message });
      return null;
    }
  }

  isToday(date) {
    if (!date) return false;
    const today = new Date();
    const checkDate = new Date(date);
    return (
      checkDate.getFullYear() === today.getFullYear() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getDate() === today.getDate()
    );
  }

  suggestFocus(tasks) {
    if (tasks.length === 0) return 'No tasks today!';
    const highPriority = tasks.filter(t => t.priority === 'high');
    if (highPriority.length > 0) {
      return `Focus on: ${highPriority[0].title}`;
    }
    return `Focus on: ${tasks[0].title}`;
  }
}

export const plannerService = new PlannerService();
