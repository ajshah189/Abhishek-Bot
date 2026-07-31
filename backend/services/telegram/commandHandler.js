import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { habitService } from '../habits/habitService.js';
import { plannerService } from '../planner/plannerService.js';
import { searchService } from '../search/searchService.js';
import { analyticsService } from '../analytics/analyticsService.js';
import { logger } from '../../utils/logger.js';
import { telegramService } from './telegramService.js';
import { db } from '../../config/firebase.js';
import { llm } from '../ai/llmAdapter.js';

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

        case 'today':
          return await this.handleToday(userId);

        case 'clear':
          return await this.handleClear(userId);

        case 'connectcalendar':
          return await this.handleConnectCalendar(userId, chatId);

        case 'disconnectcalendar':
          return await this.handleDisconnectCalendar(userId);

        case 'calendar':
          return await this.handleCalendar(userId);

        case 'upcoming':
          return await this.handleUpcoming(userId);

        case 'savecontact':
          return await this.handleSaveContact(userId, chatId, args);

        case 'apps':
          return this.handleApps();

        case 'news':
          return await this.handleNews(userId, chatId, args);

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
    return `Abhishek Assistant - Commands

Daily
/today - Combined day view (calendar + tasks + habits + spend)
/daily - Morning brief
/evening - Evening review

Tasks
/tasks - Show pending tasks

Expenses
/expenses - Monthly summary
/budget [category amount] - View or set budgets

Habits
/habits - Show all habits
/streaks - Habit streak tracker
/cleanhabits - Remove duplicate habits

Calendar
/connectcalendar - Link Google Calendar
/disconnectcalendar - Unlink Google Calendar
/calendar - Today's schedule
/upcoming - Next 10 events

Analytics
/weekly - Weekly report

Search
/search <query> - Search all data
/news [topic] - Latest news headlines

Contacts
/savecontact [name] - Send saved contact as .vcf to add to phone
/apps - List all quick phone actions (call, SMS, maps, music, timer)

Utilities
/clear - Reset conversation memory
/settings - Manage settings

Just type naturally:
- "Meeting with Riya tomorrow at 4pm"
- "Spent 450 on dinner"
- "Remember I like Jain food"
- Upload a PDF to summarize and ask questions
- Send a photo of a receipt to auto-log it`;
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

  async handleToday(userId) {
    const { habitService } = await import('../habits/habitService.js');
    const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
    const { formatDate } = await import('../ai/dateParser.js');

    const todayIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
    const todayStr = todayIST.toISOString().slice(0, 10);

    const [tasks, expenseSummary, habits, calendarResult] = await Promise.all([
      taskService.getUserTasks(userId, 'pending'),
      expenseService.getMonthlySummary(userId),
      habitService.getUserHabits(userId),
      googleCalendarService.listTodayEvents(userId).catch(() => null)
    ]);

    // Calendar events
    let calendarBlock = 'Calendar: not connected';
    let calendarFootnote = ' Connect your calendar with /connectcalendar for a fuller picture.';
    if (Array.isArray(calendarResult) && calendarResult.length) {
      calendarBlock = calendarResult.map(e => {
        const t = new Date(e.start);
        const time = isNaN(t) ? e.start : t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        return `${e.title} at ${time}`;
      }).join(', ');
      calendarFootnote = '';
    } else if (Array.isArray(calendarResult)) {
      calendarBlock = 'Calendar: no events today';
      calendarFootnote = '';
    }

    // Tasks due today
    const dueTodayTasks = tasks.filter(t => {
      if (!t.deadline) return false;
      const d = new Date(t.deadline?.toDate ? t.deadline.toDate() : t.deadline);
      return d.toISOString().slice(0, 10) === todayStr;
    });
    const taskBlock = tasks.length
      ? `${tasks.length} pending task(s)${dueTodayTasks.length ? `, ${dueTodayTasks.length} due today: ${dueTodayTasks.map(t => t.title).join(', ')}` : ''}`
      : 'no pending tasks';

    // Habits
    const habitBlock = habits.length
      ? habits.map(h => `${h.name} (streak: ${h.streak || 0})`).join(', ')
      : 'no habits set';

    // Spend
    const totalSpend = Object.values(expenseSummary).reduce((s, v) => s + v, 0);
    const spendBlock = totalSpend > 0 ? `Rs.${Math.round(totalSpend)} spent this month` : 'no expenses logged this month';

    const dataPrompt = `Today's data for Abhishek:
Calendar: ${calendarBlock}
Tasks: ${taskBlock}
Habits: ${habitBlock}
Spending: ${spendBlock}`;

    const summary = await llm.call(
      'You are a crisp chief-of-staff. Summarize the user\'s day in 3-5 sentences: what\'s on their calendar, what tasks need attention, which habits to track, and a spending note. Be specific with names and times. No filler phrases.',
      dataPrompt,
      0.5
    );

    return summary + calendarFootnote;
  }

  handleApps() {
    return `📱 Quick Actions — just say it naturally:

📞 "Call [name]" — opens your phone dialler
💬 "Text [name] [message]" — opens SMS with pre-filled message
📱 "Tell [name] [message]" — WhatsApp message
🗺️ "Navigate to [place]" — Google Maps directions
🎵 "Play [song/artist/genre]" — YouTube Music
🔗 "Open [app name]" — opens app or website
⏱️ "Set [X] minute timer" — Google timer

Supported apps:
Amazon · Flipkart · Swiggy · Zomato · Uber · Ola · GPay · Paytm · LinkedIn · Instagram · Twitter · YouTube · Gmail · Maps · Drive · Moodle · Notion · Spotify · Netflix · Hotstar

Contact must be saved for calling/texting. Say "save [name]'s number [number]" first.`;
  }

  async handleSaveContact(userId, chatId, args) {
    if (!args.length) return '📱 Usage: /savecontact [name]\nExample: /savecontact Riya';
    const name = args.join(' ');
    try {
      const { contactService } = await import('../contacts/contactService.js');
      const contacts = await contactService.getUserContacts(userId);
      const contact = contactService.matchContact(contacts, name);
      if (!contact) return `No contact named "${name}" found. Save them first by saying "save [name] [number]".`;
      if (!contact.phone) return `Found ${contact.name} but they have no phone number saved.`;
      await telegramService.sendContactVCF(chatId, contact.name, contact.phone, contact.email || '');
      return null; // VCF file already sent
    } catch (err) {
      logger.error('handleSaveContact failed', { error: err.message });
      return '❌ Could not send contact file. Try again.';
    }
  }

  async handleNews(userId, chatId, args) {
    const query = args.length ? args.join(' ') : 'India business technology latest news';
    try {
      const { webSearchService } = await import('../search/webSearchService.js');
      await telegramService.sendMessage(chatId, `🔍 Searching news for "${query}"...`);
      const results = await webSearchService.searchNews(query, 5);
      if (!results.length) return '📰 No news results found. Try a different query.';

      let msg = `📰 *Latest: ${query}*\n\n`;
      results.forEach((r, i) => {
        msg += `${i + 1}. *${r.title}*\n`;
        if (r.snippet) msg += `   ${r.snippet.slice(0, 120)}${r.snippet.length > 120 ? '…' : ''}\n`;
        if (r.url) msg += `   ${r.url}\n`;
        msg += '\n';
      });
      return msg.trim();
    } catch (err) {
      logger.error('handleNews failed', { error: err.message });
      return '❌ Could not fetch news right now. Try again.';
    }
  }

  async handleClear(userId) {
    const { conversationMemory } = await import('../memory/conversationMemory.js');
    await Promise.all([
      conversationMemory.clearHistory(userId),
      db.collection('settings').doc(`session_${userId}`).delete().catch(() => {})
    ]);
    return 'Conversation memory cleared. Fresh start.';
  }

  async handleDisconnectCalendar(userId) {
    try {
      await db.collection('google_tokens').doc(userId.toString()).delete();
      return 'Google Calendar disconnected. Use /connectcalendar to connect a different account.';
    } catch (err) {
      logger.error('handleDisconnectCalendar failed', { error: err.message });
      return 'Could not disconnect. Try again.';
    }
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
