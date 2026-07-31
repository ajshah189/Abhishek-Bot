import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { telegramService } from '../telegram/telegramService.js';
import { llm } from '../ai/llmAdapter.js';

const USER_NAME = process.env.USER_NAME || 'User';

export class AnalyticsService {
  async generateWeeklyReport(userId, chatId) {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [tasksCompleted, expensesData, habitsData, journalEntries, wins] = await Promise.all([
        this.getCompletedTasks(userId, weekAgo, now),
        this.getExpensesSummary(userId, weekAgo, now),
        this.getHabitStats(userId),
        this.getJournalEntries(userId, weekAgo, now),
        this.getWeeklyWins(userId, weekAgo, now)
      ]);

      const report = await this.buildNarrativeReport({
        tasksCompleted, expensesData, habitsData, journalEntries, wins, weekAgo, now
      });

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
        const h = doc.data();
        return { name: h.name, streak: h.streak || 0, frequency: h.frequency };
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
        .where('type', '!=', 'win')
        .orderBy('type')
        .orderBy('createdAt', 'desc')
        .get();
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      // Fallback without type filter if index not ready
      try {
        const snapshot = await db
          .collection('journal')
          .where('userId', '==', userId.toString())
          .where('createdAt', '>=', from)
          .where('createdAt', '<=', to)
          .orderBy('createdAt', 'desc')
          .get();
        return snapshot.docs.map(d => d.data()).filter(e => e.type !== 'win');
      } catch {
        return [];
      }
    }
  }

  async getWeeklyWins(userId, from, to) {
    try {
      const snapshot = await db
        .collection('journal')
        .where('userId', '==', userId.toString())
        .where('type', '==', 'win')
        .where('createdAt', '>=', from)
        .where('createdAt', '<=', to)
        .get();
      return snapshot.docs.map(d => d.data());
    } catch (err) {
      logger.error('getWeeklyWins failed', { error: err.message });
      return [];
    }
  }

  async buildNarrativeReport({ tasksCompleted, expensesData, habitsData, journalEntries, wins, weekAgo, now }) {
    const taskNames = tasksCompleted.map(t => t.title).slice(0, 6).join(', ') || 'none';
    const expenseBreakdown = Object.entries(expensesData.summary)
      .map(([c, a]) => `${c} ₹${Math.round(a)}`).join(', ') || 'nothing logged';
    const topHabits = habitsData
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 4)
      .map(h => `${h.name} (${h.streak}d streak)`)
      .join(', ') || 'none tracked';
    const winsList = wins.map(w => w.content || w.title).slice(0, 5).join(' | ') || 'none';
    const mostActive = this.getMostActiveDay(tasksCompleted);

    const dataPrompt = `Week: ${weekAgo.toDateString()} – ${now.toDateString()}
Tasks completed (${tasksCompleted.length}): ${taskNames}
Spending (total ₹${Math.round(expensesData.total)}): ${expenseBreakdown}
Habits: ${topHabits}
Wins logged (${wins.length}): ${winsList}
Most productive day: ${mostActive}
Journal entries: ${journalEntries.length}`;

    try {
      const narrative = await llm.call(
        `You are ${USER_NAME}'s chief-of-staff writing their Sunday weekly reflection. Write exactly 5 sentences: 1) what went well this week (mention specific tasks/amounts/streaks), 2) what needs attention or was missed, 3) spending note vs normal pattern, 4) one actionable suggestion for next week, 5) a motivating close. Tone: supportive but direct, like a good coach. Use Telegram Markdown (*bold* for key numbers/names).`,
        dataPrompt,
        0.7
      );
      return `📊 *Weekly Reflection*\n\n${narrative}`;
    } catch (err) {
      logger.error('Weekly narrative LLM failed, using fallback', { error: err.message });
      return this.formatWeeklyReport({ tasksCompleted, expensesData, habitsData, journalEntries });
    }
  }

  getMostActiveDay(tasks) {
    if (!tasks.length) return 'N/A';
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = {};
    tasks.forEach(t => {
      const d = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt || 0);
      const day = DAYS[d.getDay()];
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  }

  formatWeeklyReport({ tasksCompleted, expensesData, habitsData, journalEntries }) {
    let report = `📊 *Weekly Report*\n\n`;
    report += `✅ *Tasks Completed*: ${tasksCompleted.length}\n`;
    tasksCompleted.slice(0, 3).forEach((t, i) => { report += `  ${i + 1}. ${t.title}\n`; });
    report += `\n💰 *Weekly Spending*: ₹${expensesData.total.toFixed(0)}\n`;
    Object.entries(expensesData.summary).forEach(([cat, amount]) => {
      report += `  • ${cat}: ₹${Math.round(amount)}\n`;
    });
    report += `\n🎯 *Habits*:\n`;
    habitsData.slice(0, 5).forEach(h => { report += `  • ${h.name}: ${h.streak} day streak\n`; });
    report += `\n📖 *Journal Entries*: ${journalEntries.length}`;
    return report;
  }
}

export const analyticsService = new AnalyticsService();
