import { taskService } from '../tasks/taskService.js';
import { habitService } from '../habits/habitService.js';
import { expenseService } from '../expenses/expenseService.js';
import { winsService } from '../wins/winsService.js';
import { llm } from '../ai/llmAdapter.js';
import { telegramService } from '../telegram/telegramService.js';
import { logger } from '../../utils/logger.js';

const USER_NAME = process.env.USER_NAME || 'User';

export class PlannerService {
  // ── Proactive sends (called by proactiveScheduler) ─────────────────────

  async sendMorningBrief(userId, chatId) {
    const today = new Date();
    const [tasks, habits, expenseSummary, weeklyWins] = await Promise.all([
      taskService.getUserTasks(userId, 'pending'),
      habitService.getUserHabits(userId),
      expenseService.getMonthlySummary(userId),
      winsService.getWeeklyWinCount(userId).catch(() => 0)
    ]);

    const todayTasks = tasks.filter(t => this.isToday(t.deadline));
    const overdueTasks = tasks.filter(t => t.deadline && new Date(t.deadline) < today && !this.isToday(t.deadline));
    const totalSpend = Object.values(expenseSummary).reduce((s, v) => s + v, 0);

    const taskLines = tasks.slice(0, 8)
      .map(t => `- ${t.title} [${t.priority}] due: ${t.deadline ? new Date(t.deadline).toDateString() : 'none'}`)
      .join('\n') || 'No pending tasks';

    const habitLines = habits.map(h => `- ${h.name} (streak: ${h.streak})`).join('\n') || 'No habits';
    const expenseLines = Object.entries(expenseSummary).map(([c, a]) => `${c}: ₹${a}`).join(', ') || '₹0';

    const winsNote = weeklyWins >= 3 ? `\nWeekly wins so far: ${weeklyWins} — mention this to celebrate momentum.` : '';

    const brief = await llm.call(
      `You are ${USER_NAME}'s personal chief-of-staff. Write a crisp 3–5 sentence morning brief. Be direct and motivating — no filler. Highlight today's most important tasks, any overdue items, habit streaks to keep alive, and spending if notable. End with one punchy line. Use Telegram Markdown (*bold*).`,
      `Today: ${today.toDateString()}
Pending tasks (${tasks.length} total, ${todayTasks.length} due today, ${overdueTasks.length} overdue):
${taskLines}

Habits:
${habitLines}

Month spend: ${expenseLines} (total ₹${totalSpend.toFixed(0)})${winsNote}`,
      0.7
    );

    await telegramService.sendMessage(chatId, `🌅 *Good morning!*\n\n${brief}`);
    logger.info('Morning brief sent', { userId });
  }

  async sendEveningReview(userId, chatId) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const [pendingTasks, completedTasks, habits, expenseSummary] = await Promise.all([
      taskService.getUserTasks(userId, 'pending'),
      taskService.getUserTasks(userId, 'completed'),
      habitService.getUserHabits(userId),
      expenseService.getMonthlySummary(userId)
    ]);

    const completedToday = completedTasks.filter(t => {
      const at = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt || 0);
      return at >= startOfDay;
    });

    const totalSpend = Object.values(expenseSummary).reduce((s, v) => s + v, 0);

    const completedLines = completedToday.map(t => `- ✅ ${t.title}`).join('\n') || 'None completed today — tomorrow is a fresh start.';
    const pendingLines = pendingTasks.slice(0, 5).map(t => `- ${t.title}`).join('\n') || 'All clear!';
    const habitLines = habits.map(h => `- ${h.name}: ${h.streak} day streak`).join('\n') || 'No habits tracked';

    const review = await llm.call(
      `You are ${USER_NAME}'s personal chief-of-staff. Write a crisp 4–6 sentence evening review. Celebrate wins, acknowledge pending tasks without guilt, mention today's habits. End with exactly this line: "What's one thing you're proud of today?" Use Telegram Markdown (*bold*).`,
      `Completed today:
${completedLines}

Still pending (${pendingTasks.length}):
${pendingLines}

Habits:
${habitLines}

Monthly spending: ₹${totalSpend.toFixed(0)}`,
      0.7
    );

    await telegramService.sendMessage(chatId, `📊 *Evening Review*\n\n${review}`);

    // Set win capture window — next message within 10 minutes gets stored as a win
    await winsService.setWinPending(userId).catch(err =>
      logger.error('setWinPending failed', { error: err.message })
    );
    logger.info('Evening review sent', { userId });
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
