import { taskService } from '../tasks/taskService.js';
import { habitService } from '../habits/habitService.js';
import { expenseService } from '../expenses/expenseService.js';
import { winsService } from '../wins/winsService.js';
import { telegramService } from '../telegram/telegramService.js';
import { logger } from '../../utils/logger.js';

export class PlannerService {
  // ── Proactive sends (called by proactiveScheduler) ─────────────────────

  async sendMorningBrief(userId, chatId) {
    const today = new Date();
    const [tasks, habits, weeklyWins] = await Promise.all([
      taskService.getUserTasks(userId, 'pending'),
      habitService.getUserHabits(userId),
      winsService.getWeeklyWinCount(userId).catch(() => 0)
    ]);

    const overdue   = tasks.filter(t => t.deadline && !this.isToday(t.deadline) && new Date(t.deadline?.toDate ? t.deadline.toDate() : t.deadline) < today);
    const dueToday  = tasks.filter(t => this.isToday(t.deadline));

    let brief = `☀️ *Good morning!*\n\n`;
    if (dueToday.length)  brief += `📌 *Due today:* ${dueToday.map(t => t.title).join(', ')}\n`;
    if (overdue.length)   brief += `⚠️ *Overdue:* ${overdue.map(t => t.title).join(', ')}\n`;
    if (tasks.length)     brief += `📋 ${tasks.length} pending task${tasks.length !== 1 ? 's' : ''} total\n`;
    if (habits.length)    brief += `🎯 *Habits:* ${habits.map(h => `${h.name}${h.streak ? ` (${h.streak}d)` : ''}`).join(', ')}\n`;
    if (weeklyWins >= 3)  brief += `🏆 ${weeklyWins} wins this week!\n`;
    if (!tasks.length && !habits.length) brief += `Clear slate — make today count.\n`;
    brief += `\nHave a great day!`;

    await telegramService.sendMessage(chatId, brief);
    logger.info('Morning brief sent (template)', { userId, taskCount: tasks.length, overdueCount: overdue.length });
  }

  async sendEveningReview(userId, chatId) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const [pendingTasks, completedTasks, habits] = await Promise.all([
      taskService.getUserTasks(userId, 'pending'),
      taskService.getUserTasks(userId, 'completed'),
      habitService.getUserHabits(userId)
    ]);

    const completedToday = completedTasks.filter(t => {
      const at = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt || 0);
      return at >= startOfDay;
    });
    const habitsDoneToday = habits.filter(h => this.isHabitDoneToday(h));

    let review = `📊 *Evening Review*\n\n`;
    if (completedToday.length) {
      review += `✅ *Done today:* ${completedToday.map(t => t.title).join(', ')}\n`;
    } else {
      review += `📭 Nothing completed today — tomorrow is a fresh start.\n`;
    }
    if (pendingTasks.length) {
      review += `📋 ${pendingTasks.length} task${pendingTasks.length !== 1 ? 's' : ''} still pending\n`;
    }
    if (habits.length) {
      review += `🎯 Habits: ${habitsDoneToday.length}/${habits.length} done today\n`;
    }
    review += `\n*What's one thing you're proud of today?*`;

    await telegramService.sendMessage(chatId, review);

    // Set win capture window — next message within 10 minutes gets stored as a win
    await winsService.setWinPending(userId).catch(err =>
      logger.error('setWinPending failed', { error: err.message })
    );
    logger.info('Evening review sent (template)', { userId, completedToday: completedToday.length });
  }

  isHabitDoneToday(h) {
    if (!h.lastCompleted) return false;
    const last = h.lastCompleted?.toDate ? h.lastCompleted.toDate() : new Date(h.lastCompleted);
    const today = new Date();
    return last.getFullYear() === today.getFullYear() &&
           last.getMonth()    === today.getMonth()    &&
           last.getDate()     === today.getDate();
  }

  // ── Legacy methods (used by commandHandler /daily and /evening) ─────────

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
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.getFullYear() === today.getFullYear() &&
           d.getMonth() === today.getMonth() &&
           d.getDate() === today.getDate();
  }

  suggestFocus(tasks) {
    if (!tasks.length) return 'No tasks today!';
    const hp = tasks.find(t => t.priority === 'high');
    return `Focus on: ${(hp || tasks[0]).title}`;
  }
}

export const plannerService = new PlannerService();
