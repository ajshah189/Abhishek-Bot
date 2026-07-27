import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { habitService } from '../habits/habitService.js';
import { plannerService } from '../planner/plannerService.js';
import { searchService } from '../search/searchService.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { logger } from '../../utils/logger.js';

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

🎯 *Habits*
/habits - Show all habits

📊 *Analytics*
/weekly - Weekly report

🔍 *Search*
/search <query> - Search all data

⚙️ *Settings*
/settings - Manage settings

💬 *Natural Commands*
Just type naturally:
- "Gym tomorrow 6"
- "Spent ₹450 on dinner"
- "Remember I like Jain food"
- "Add task: finish assignment"`;
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
