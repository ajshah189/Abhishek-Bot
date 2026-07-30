import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { habitService } from '../habits/habitService.js';
import { plannerService } from '../planner/plannerService.js';
import { searchService } from '../search/searchService.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { logger } from '../../utils/logger.js';
import { telegramService } from './telegramService.js';

export class CommandHandler {
  async handle(userId, chatId, command, args) {
    try {
      const commandName = command.toLowerCase().replace('/', '');

      switch (commandName) {
        case 'tasks':
          return await this.handleTasks(userId, args);

        case 'daily':
        case 'brief':
          return await this.handleDailyBrief(userId);

        case 'evening':
          return await this.handleEveningReview(userId);

        case 'habits':
          return await this.handleHabits(userId);

        case 'expenses':
          return await this.handleExpenses(userId);

        case 'search':
          return await this.handleSearch(userId, args);

        case 'weekly':
          return await this.handleWeeklyReport(userId, chatId);

        case 'help':
          return this.handleHelp();

        case 'budget':
          return await this.handleBudget(userId, args);

        case 'streaks':
          return await this.handleStreaks(userId);

        case 'cleanhabits':
          return await this.handleCleanHabits(userId);

        case 'connectcalendar':
          return await this.handleConnectCalendar(userId, chatId);

        case 'calendar':
          return await this.handleCalendar(userId);

        case 'upcoming':
          return await this.handleUpcoming(userId);

        case 'settings':
          return this.handleSettings();

        default:
          return `Unknown command: ${command}. Type /help for available commands.`;
      }
    } catch (error) {
      logger.error('Command handler error', { command, error: error.message });
      return '❌ Error processing command.';
    }
  }

  async handleTasks(userId, args) {
    const tasks = await taskService.getUserTasks(userId, 'pending');

    if (tasks.length === 0) {
      return '✅ No pending tasks! Great job.';
    }

    let message = `📋 Your Tasks (${tasks.length})\n\n`;
    tasks.slice(0, 10).forEach((task, i) => {
      const deadline = task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline';
      message += `${i + 1}. ${task.title}\n   📅 ${deadline}\n   Priority: ${task.priority}\n\n`;
    });

    if (tasks.length > 10) {
      message += `...and ${tasks.length - 10} more`;
    }

    return message;
  }

  async handleDailyBrief(userId) {
    const brief = await plannerService.getDailyBrief(userId);

    if (!brief) return 'Could not generate daily brief.';

    let message = `${brief.greeting}\n\n`;
    message += `📋 Tasks Today: ${brief.taskCount}\n`;
    message += `💡 ${brief.focus}\n\n`;
    message += `Use /tasks to see all pending tasks.`;

    return message;
  }

  async handleEveningReview(userId) {
    const review = await plannerService.getEveningReview(userId);

    if (!review) return 'Could not generate evening review.';

    let message = `${review.greeting}\n\n`;
    message += `✅ Completed Today: ${review.completedCount}\n`;
    message += `📝 Still Pending: ${review.pendingCount}\n\n`;
    message += `Great work! Keep pushing tomorrow.`;

    return message;
  }

  async handleHabits(userId) {
    const habits = await habitService.getUserHabits(userId);

    if (habits.length === 0) {
      return '🎯 No habits yet. Add one by saying "Add gym habit"';
    }

    let message = `🎯 Your Habits\n\n`;
    habits.slice(0, 10).forEach((habit, i) => {
      message += `${i + 1}. ${habit.name}\n   Streak: ${habit.streak} days\n   Frequency: ${habit.frequency}\n\n`;
    });

    return message;
  }

  async handleExpenses(userId) {
    const summary = await expenseService.getMonthlySummary(userId);

    if (Object.keys(summary).length === 0) {
      return '💰 No expenses this month.';
    }

    let message = `💰 Monthly Expenses\n\n`;
    let total = 0;

    Object.entries(summary).forEach(([category, amount]) => {
      message += `${category}: ₹${amount.toFixed(2)}\n`;
      total += amount;
    });

    message += `\n📊 Total: ₹${total.toFixed(2)}`;

    return message;
  }

  async handleSearch(userId, args) {
    if (!args || args.length === 0) {
      return '🔍 Usage: /search <query>\nExample: /search assignments';
    }

    const query = args.join(' ');
    const results = await searchService.globalSearch(userId, query);

    let message = `🔍 Search Results for "${query}"\n\n`;
    let found = false;

    if (results.tasks.length > 0) {
      found = true;
      message += `📋 Tasks (${results.tasks.length}):\n`;
      results.tasks.slice(0, 3).forEach(t => { message += `  • ${t.title}\n`; });
      message += '\n';
    }

    if (results.notes.length > 0) {
      found = true;
      message += `📝 Notes (${results.notes.length}):\n`;
      results.notes.slice(0, 3).forEach(n => { message += `  • ${n.title}\n`; });
      message += '\n';
    }

    if (results.memories.length > 0) {
      found = true;
      message += `🧠 Memories (${results.memories.length}):\n`;
      results.memories.slice(0, 3).forEach(m => { message += `  • ${m.value}\n`; });
      message += '\n';
    }

    if (results.journal.length > 0) {
      found = true;
      message += `📖 Journal (${results.journal.length}):\n`;
      results.journal.slice(0, 3).forEach(e => { message += `  • ${e.title}\n`; });
    }

    return found ? message : `No results found for "${query}"`;
  }

  async handleWeeklyReport(userId, chatId) {
    await analyticsService.generateWeeklyReport(userId, chatId);
    return null;
  }

  handleHelp() {
    return `🤖 Abhishek Assistant - Commands

📋 *Tasks*
/tasks - Show pending tasks
/daily - Daily brief
/evening - Evening review

💰 *Expenses*
/expenses - Monthly summary
/budget [category amount] - View or set budgets

🎯 *Habits*
/habits - Show all habits
/streaks - Habit streak tracker
/cleanhabits - Remove duplicate habits

🗓 *Calendar*
/connectcalendar - Link Google Calendar
/calendar - Today's schedule
/upcoming - Next 10 events

📊 *Analytics*
/weekly - Weekly report

🔍 *Search*
/search <query> - Search all data

⚙️ *Settings*
/settings - Manage settings

💬 *Natural Commands*
Just type naturally:
- "Meeting with Riya tomorrow at 4pm"
- "Gym tomorrow 6"
- "Spent ₹450 on dinner"
- "Remember I like Jain food"
- "Add task: finish assignment"`;
  }

  async handleConnectCalendar(userId, chatId) {
    try {
      const { getAuthUrl } = await import('../calendar/googleAuth.js');
      const url = getAuthUrl(userId);
      logger.info('OAuth URL generated', { userId, url });
      await telegramService.sendMessageWithButton(
        chatId,
        '🗓 Connect Google Calendar\n\nTap the button below to authorize. After connecting, use /calendar to see today\'s events.',
        '🔗 Authorize Google Calendar',
        url
      );
      return null;
    } catch (err) {
      logger.error('handleConnectCalendar failed', { error: err.message });
      return '❌ Could not generate auth link. Try again.';
    }
  }

  async handleCalendar(userId) {
    try {
      const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
      const events = await googleCalendarService.listTodayEvents(userId);
      if (events?.error === 'not_connected') return `${events.message}`;
      if (events?.error) return `❌ Calendar error: ${events.error}`;
      if (!events.length) return '📅 No events today. Clear schedule!';
      return `📅 *Today\'s Calendar*\n\n${googleCalendarService.formatEvents(events)}`;
    } catch (err) {
      logger.error('handleCalendar failed', { error: err.message });
      return '❌ Could not fetch calendar. Try again.';
    }
  }

  async handleUpcoming(userId) {
    try {
      const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
      const events = await googleCalendarService.listUpcomingEvents(userId, 10);
      if (events?.error === 'not_connected') return `${events.message}`;
      if (events?.error) return `❌ Calendar error: ${events.error}`;
      if (!events.length) return '📅 No upcoming events.';
      return `📅 *Upcoming Events*\n\n${googleCalendarService.formatEvents(events)}`;
    } catch (err) {
      logger.error('handleUpcoming failed', { error: err.message });
      return '❌ Could not fetch events. Try again.';
    }
  }

  async handleCleanHabits(userId) {
    const deleted = await habitService.deduplicateForUser(userId);
    if (deleted === 0) return '✅ No duplicate habits found.';
    return `🧹 Removed ${deleted} duplicate habit${deleted !== 1 ? 's' : ''}. Run /streaks to see the clean list.`;
  }

  async handleStreaks(userId) {
    const habits = await habitService.getUserHabits(userId);
    if (!habits.length) return '🎯 No habits yet. Say "add a habit to meditate daily" to start.';
    let msg = '🔥 Habit Streaks\n\n';
    habits.forEach(h => {
      const streak = h.streak || 0;
      const flame = streak >= 7 ? '🔥' : streak >= 3 ? '✨' : '○';
      msg += `${flame} ${h.name} — ${streak} day${streak !== 1 ? 's' : ''} (${h.frequency})\n`;
    });
    msg += '\nSay "done meditating" to mark one complete.';
    return msg;
  }

  async handleBudget(userId, args) {
    const { budgetService } = await import('../expenses/budgetService.js');

    if (args.length >= 2) {
      const category = args[0].toLowerCase();
      const amount = parseInt(args[1], 10);
      if (isNaN(amount)) return 'Usage: /budget food 10000';
      await budgetService.setBudget(userId, category, amount);
      return `✅ ${category} budget set to ₹${amount}/month.`;
    }

    const budgets = await budgetService.getBudgets(userId);
    let msg = '💰 Monthly Budgets\n\n';
    for (const [cat, amt] of Object.entries(budgets)) {
      msg += `${cat}: ₹${amt}\n`;
    }
    msg += '\nSet one with: /budget food 10000';
    return msg;
  }

  handleSettings() {
    return `⚙️ Settings

🔔 Notifications
Daily Planner: 08:00 AM
Evening Review: 09:00 PM

🌍 Timezone: Asia/Kolkata
🗣️ Language: English`;
  }
}

export const commandHandler = new CommandHandler();
