import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { telegramService } from '../telegram/telegramService.js';

export class AnalyticsService {
  async generateWeeklyReport(userId, chatId) {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [tasksCompleted, expensesData, habitsData, journalEntries] = await Promise.all([
        this.getCompletedTasks(userId, weekAgo, now),
        this.getExpensesSummary(userId, weekAgo, now),
        this.getHabitStats(userId),
        this.getJournalEntries(userId, weekAgo, now)
      ]);

      const report = this.formatWeeklyReport({ tasksCompleted, expensesData, habitsData, journalEntries });

      await telegramService.sendMessage(chatId, report);

      logger.info('Weekly report generated', { userId, taskCount: tasksCompleted.length });
      return report;
    } catch (error) {
      logger.error('Failed to generate weekly report', { error: error.message });
      throw error;
    }
  }

  async getCompletedTasks(userId, from, to) {
    try {
      const snapshot = await db
        .collection('tasks')
        .where('userId', '==', userId.toString())
        .where('status', '==', 'completed')
        .where('completedAt', '>=', from)
        .where('completedAt', '<=', to)
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch completed tasks', { error: error.message });
      return [];
    }
  }

  async getExpensesSummary(userId, from, to) {
    try {
      const snapshot = await db
        .collection('expenses')
        .where('userId', '==', userId.toString())
        .where('date', '>=', from)
        .where('date', '<=', to)
        .get();

      const expenses = snapshot.docs.map(doc => doc.data());
      const summary = {};
      let total = 0;

      expenses.forEach(exp => {
        const category = exp.category || 'others';
        summary[category] = (summary[category] || 0) + exp.amount;
        total += exp.amount;
      });

      return { summary, total, count: expenses.length };
    } catch (error) {
      logger.error('Failed to fetch expenses', { error: error.message });
      return { summary: {}, total: 0, count: 0 };
    }
  }

  async getHabitStats(userId) {
    try {
      const snapshot = await db
        .collection('habits')
        .where('userId', '==', userId.toString())
        .get();

      return snapshot.docs.map(doc => {
        const habit = doc.data();
        return { name: habit.name, streak: habit.streak || 0, frequency: habit.frequency };
      });
    } catch (error) {
      logger.error('Failed to fetch habit stats', { error: error.message });
      return [];
    }
  }

  async getJournalEntries(userId, from, to) {
    try {
      const snapshot = await db
        .collection('journal')
        .where('userId', '==', userId.toString())
        .where('createdAt', '>=', from)
        .where('createdAt', '<=', to)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch journal entries', { error: error.message });
      return [];
    }
  }

  formatWeeklyReport({ tasksCompleted, expensesData, habitsData, journalEntries }) {
    let report = `📊 *Weekly Analytics Report*\n\n`;

    report += `✅ *Tasks Completed*: ${tasksCompleted.length}\n`;
    if (tasksCompleted.length > 0) {
      report += `Top 3:\n`;
      tasksCompleted.slice(0, 3).forEach((task, i) => {
        report += `  ${i + 1}. ${task.title}\n`;
      });
    }
    report += `\n`;

    report += `💰 *Weekly Spending*: ₹${expensesData.total.toFixed(2)}\n`;
    if (Object.keys(expensesData.summary).length > 0) {
      report += `Breakdown:\n`;
      Object.entries(expensesData.summary).forEach(([cat, amount]) => {
        report += `  • ${cat}: ₹${amount.toFixed(2)}\n`;
      });
    }
    report += `\n`;

    report += `🎯 *Habits*: ${habitsData.length}\n`;
    habitsData.slice(0, 5).forEach(habit => {
      report += `  • ${habit.name}: ${habit.streak} day streak\n`;
    });
    report += `\n`;

    report += `📖 *Journal Entries*: ${journalEntries.length}\n`;
    if (journalEntries.length > 0) {
      report += `Last entry: ${journalEntries[0].title}\n`;
    }

    report += `\n*Keep pushing! Great week ahead.* 🚀`;

    return report;
  }
}

export const analyticsService = new AnalyticsService();
