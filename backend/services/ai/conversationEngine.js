import { config } from 'dotenv';
config();

import { db } from '../../config/firebase.js';
import { llm, isTokenBudgetLow } from './llmAdapter.js';
import { contextCache } from './contextCache.js';
import { logger } from '../../utils/logger.js';
import { parseDate, formatDate } from './dateParser.js';
import { conversationMemory } from '../memory/conversationMemory.js';
import { memoryService } from '../memory/memoryService.js';
import { taskService } from '../tasks/taskService.js';
import { expenseService } from '../expenses/expenseService.js';
import { habitService } from '../habits/habitService.js';
import { contactService } from '../contacts/contactService.js';
import { telegramService } from '../telegram/telegramService.js';
import { winsService } from '../wins/winsService.js';

// ── IST helpers ────────────────────────────────────────────────────────────
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istNow() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

function istDateStr(date) {
  if (!date) return '';
  const d = new Date(
    (date.toDate ? date.toDate() : new Date(date)).getTime() + IST_OFFSET_MS
  );
  return d.toISOString().slice(0, 10);
}

function isCompletedToday(habit) {
  if (!habit.lastCompleted) return false;
  return istDateStr(habit.lastCompleted) === istDateStr(new Date());
}

// ── Runtime config ──────────────────────────────────────────────────────────
const USER_NAME     = process.env.USER_NAME     || 'User';
const USER_TIMEZONE = process.env.USER_TIMEZONE || 'Asia/Kolkata';
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';

// ── Conversation prompt — free-form mode (no JSON, pure personality) ───────
const CONVERSATION_PROMPT = `You are ${USER_NAME}'s personal chief-of-staff and close confidant. Direct, witty, occasionally dry. You pick sides ("go with A because…"), match energy, and understand Indian context. No filler ("How can I assist?", "Great question!", "Feel free to ask.").

Short messages → 1-2 sentences. Questions → answer first. Advice → opinionated. Stress/venting → acknowledge before helping, don't be chirpy. Late night → warmer. Early morning → brief.

RESPOND AS PLAIN TEXT. No JSON. No bullet lists unless the content genuinely needs structure.`;

// ── Action prompt core — structured mode (JSON required) ───────────────────
const ACTION_PROMPT_CORE = `You are ${USER_NAME}'s chief-of-staff (timezone: ${USER_TIMEZONE}). Respond with valid JSON only: {"reply":"...","actions":[...]}

REPLY: One natural sentence confirming the action. Two sentences max — add a brief implication only if genuinely useful. No filler, no announcements.${DASHBOARD_URL ? `\n"my dashboard" → ${DASHBOARD_URL}` : ''}

RULES:
- Habits are recurring — never create_task for a habit.
- "delete all habits/expenses" → delete_all_* type, NO match field.
- Expense period: "today|this_week|this_month" | Task period: "today|this_week|completed"
- send_whatsapp: confirm draft in reply, no raw URL (system appends link).
- WIN_CAPTURE_PENDING → store_win with exact words. Also emit store_win for natural wins ("finished X", "proud of Y").
- FOLLOW-UP present → complete the goal, don't ask again.
- QUICK CAPTURE: "200 chai"→expense | "gym done"→complete_habit | "mtg 3pm"→calendar event | "Riya bday May5"→store_memory`;

// Action schemas — only appended when message likely needs an action
const ACTION_SCHEMAS = `ACTIONS (emit in "actions" array):
{"type":"create_task","title":"...","deadline_text":"raw date","recurrence_text":"raw recurrence","priority":"high|medium|low"}
{"type":"create_expense","amount":0,"category":"food|travel|shopping|education|health|other","description":"..."}
{"type":"delete_expense","match":"keyword"} | {"type":"delete_all_expenses"} | {"type":"delete_expenses_timerange","period":"today|this_week|this_month"}
{"type":"store_memory","key":"...","value":"..."}
{"type":"complete_task","match":"keywords"} | {"type":"delete_task","match":"keywords"} | {"type":"delete_tasks_timerange","period":"today|this_week|completed"}
{"type":"create_habit","name":"...","recurrence":"daily|weekly|weekdays|..."} | {"type":"complete_habit","match":"keyword"} | {"type":"delete_habit","match":"name"} | {"type":"delete_all_habits"}
{"type":"create_calendar_event","title":"...","date":"raw","end_date":"raw","location":"...","description":"..."}
{"type":"create_contact","name":"...","phone":"...","relationship":"..."} | {"type":"save_to_phone","name":"...","phone":"...","email":"..."}
{"type":"send_whatsapp","contact_name":"...","message":"..."} — name must match KNOWN CONTACTS
{"type":"phone_call","contact_name":"..."} | {"type":"send_sms","contact_name":"...","message":"..."}
{"type":"navigate","destination":"..."} | {"type":"play_music","query":"..."} | {"type":"web_open","url_or_query":"..."} | {"type":"set_timer","minutes":5,"label":"..."}
{"type":"web_search","query":"3-6 word query"} — news, live prices, facts you're uncertain of; placeholder reply: "Let me check."
{"type":"store_win","text":"..."} — accomplishment shared by user
{"type":"create_list","name":"..."} | {"type":"add_to_list","list_name":"...","item":"..."} | {"type":"remove_from_list","list_name":"...","item":"..."} | {"type":"show_list","list_name":"..."} | {"type":"share_list","list_name":"...","share_with":"telegram_user_id"}
{"type":"ask_followup","waiting_for":"label","partial":{}}
If contact not found for call/SMS: "I don't have [name]'s number — save it with 'save [name]'s number [number]'"
Examples: "call Mom"→phone_call | "text dad I'll be late"→send_sms | "navigate to airport"→navigate | "play lo-fi"→play_music | "open Swiggy"→web_open | "10 min timer"→set_timer`;

// ── App shortcut map ────────────────────────────────────────────────────────
const APP_URLS = {
  amazon: 'https://www.amazon.in',
  flipkart: 'https://www.flipkart.com',
  swiggy: 'https://www.swiggy.com',
  zomato: 'https://www.zomato.com',
  uber: 'https://m.uber.com',
  ola: 'https://www.olacabs.com',
  gpay: 'https://pay.google.com',
  paytm: 'https://paytm.com',
  linkedin: 'https://www.linkedin.com',
  instagram: 'https://www.instagram.com',
  twitter: 'https://www.twitter.com',
  youtube: 'https://www.youtube.com',
  gmail: 'https://mail.google.com',
  maps: 'https://maps.google.com',
  drive: 'https://drive.google.com',
  moodle: 'https://moodle.iima.ac.in',
  notion: 'https://www.notion.so',
  spotify: 'https://open.spotify.com',
  netflix: 'https://www.netflix.com',
  hotstar: 'https://www.hotstar.com'
};

// ── Routine definitions (zero LLM tokens — pure data assembly) ────────────────
const ROUTINE_TRIGGERS = {
  'good morning': ['calendar_today', 'tasks_pending', 'habits_status'],
  'start work':   ['tasks_due_today', 'calendar_today'],
  'end of day':   ['tasks_completed_today', 'habits_status', 'expenses_today'],
  'weekly review': ['tasks_week', 'expenses_week', 'habits_week']
};

// ── Deterministic search patterns (skip classify → LLM, go straight to search) ─
const SEARCH_PATTERNS = /\b(news|search|latest|price of|weather in|who won|current|stock|score|what happened|trending|release date|review of)\b/i;

// ── Message classification ──────────────────────────────────────────────────

function classifyMessage(msg) {
  const m = (msg || '').trim();
  if (!m) return 'conversation';
  if (/^\d+[\s₹]/.test(m)) return 'action'; // "200 chai" → expense
  if (/\d+\s*rs\b/i.test(m)) return 'action'; // "food 300rs", "300rs", "300 rs"
  if (/^(add|create|remove|delete|set|save|log|spent|track)\b/i.test(m)) return 'action';
  if (/^(remind|schedule|plan|book|cancel)\b/i.test(m)) return 'action';
  if (/^(call|text|send|navigate|play|open)\b/i.test(m)) return 'action';
  if (/^(done|complete|finish|mark)\b/i.test(m)) return 'action';
  if (/\b(task|expense|habit|budget|calendar|timer|alarm|list|lists)\b/i.test(m)) return 'action';
  if (/\b(remind|schedule|todo|to-do|to do|spending|spent|paid|buy|shopping|grocery)\b/i.test(m)) return 'action';
  if (/\b(spent|paid|bought|cost)\s+\d/i.test(m)) return 'action'; // "spent 300", "paid 500"
  if (/\b(whatsapp|contact|phone number|call\s+\w|text\s+\w|navigate to|directions to|play\s+\w|open\s+\w|set.*timer|set.*alarm)\b/i.test(m)) return 'action';
  if (/\b(news|search for|look up|find out|win|wins|proud|bday|birthday)\b/i.test(m)) return 'action';
  return 'conversation';
}

function buildTimeBlock(now) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  return `NOW: ${DAYS[now.getUTCDay()]} ${now.getUTCDate()} ${MONS[now.getUTCMonth()]} ${now.getUTCFullYear()} ${h % 12 || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'PM' : 'AM'} IST`;
}

export class ConversationEngine {
  // ── Session helpers ──────────────────────────────────────────────────────

  async getSession(userId) {
    try {
      const doc = await db.collection('settings').doc(`session_${userId}`).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      logger.error('Failed to read session', { error: error.message });
      return null;
    }
  }

  async setSession(userId, data) {
    try {
      await db.collection('settings').doc(`session_${userId}`).set(data);
    } catch (error) {
      logger.error('Failed to write session', { error: error.message });
    }
  }

  async clearSession(userId) {
    try {
      await db.collection('settings').doc(`session_${userId}`).delete();
    } catch (error) {
      logger.error('Failed to clear session', { error: error.message });
    }
  }

  // ── Main entry point ─────────────────────────────────────────────────────

  async process(userId, chatId, message) {
    // Deterministic actions — zero LLM tokens
    const directResult = await this.handleDirectAction(userId, chatId, message);
    if (directResult) {
      await conversationMemory.addTurn(userId, 'user', message);
      await conversationMemory.addTurn(userId, 'assistant', directResult.reply);
      return directResult;
    }

    if (SEARCH_PATTERNS.test(message)) {
      return await this.handleSearchDirect(userId, chatId, message);
    }
    const mode = classifyMessage(message);
    if (mode === 'conversation') {
      return await this.handleConversation(userId, chatId, message);
    }
    return await this.handleAction(userId, chatId, message);
  }

  // ── Deterministic actions — regex-matched, no LLM, no Firestore context ────
  async handleDirectAction(userId, chatId, message) {
    const msg = message.toLowerCase().trim();

    // Contacts: load from cache if available, else fetch once
    let contacts = null;
    const getContacts = async () => {
      if (contacts) return contacts;
      contacts = contextCache.get(userId)?.contacts ||
        await contactService.getUserContacts(userId).catch(() => []);
      return contacts;
    };

    // "call [name]"
    const callMatch = msg.match(/^call\s+(.+)/i);
    if (callMatch) {
      const c = this.matchContact(await getContacts(), callMatch[1].trim());
      if (c?.phone) {
        const dialCode = c.phone.length === 10 ? `+91${c.phone}` : `+${c.phone}`;
        return { reply: `Calling ${c.name}...`, quickAction: { label: `📞 Call ${c.name}`, url: `tel:${dialCode}` }, whatsappLink: null };
      }
      return { reply: `I don't have ${callMatch[1].trim()}'s number. Save it with "save ${callMatch[1].trim()}'s number [number]"`, quickAction: null, whatsappLink: null };
    }

    // "text [name] [message]" or "sms [name] [message]"
    const smsMatch = msg.match(/^(?:text|sms)\s+(.+?)\s+(?:saying\s+)?(.+)/i);
    if (smsMatch) {
      const c = this.matchContact(await getContacts(), smsMatch[1].trim());
      if (c?.phone) {
        const dialCode = c.phone.length === 10 ? `+91${c.phone}` : `+${c.phone}`;
        const body = encodeURIComponent(smsMatch[2].trim());
        return { reply: `SMS to ${c.name}: "${smsMatch[2].trim()}"`, quickAction: { label: `💬 Send SMS to ${c.name}`, url: `sms:${dialCode}?body=${body}` }, whatsappLink: null };
      }
      return { reply: `I don't have ${smsMatch[1].trim()}'s number.`, quickAction: null, whatsappLink: null };
    }

    // "navigate to [place]" or "directions to [place]" or "go to [place]"
    const navMatch = msg.match(/^(?:navigate|directions|go)\s+(?:to\s+)?(.+)/i);
    if (navMatch) {
      const dest = encodeURIComponent(navMatch[1].trim());
      return { reply: `Opening directions to ${navMatch[1].trim()}`, quickAction: { label: `🗺️ Navigate to ${navMatch[1].trim()}`, url: `https://www.google.com/maps/dir/?api=1&destination=${dest}` }, whatsappLink: null };
    }

    // "play [music]"
    const playMatch = msg.match(/^play\s+(.+)/i);
    if (playMatch) {
      const q = encodeURIComponent(playMatch[1].trim());
      return { reply: `Playing ${playMatch[1].trim()}`, quickAction: { label: `🎵 Play on YouTube Music`, url: `https://music.youtube.com/search?q=${q}` }, whatsappLink: null };
    }

    // "open [app]"
    const openMatch = msg.match(/^open\s+(.+)/i);
    if (openMatch) {
      const appName = openMatch[1].toLowerCase().trim();
      const knownUrl = APP_URLS[appName];
      const url = knownUrl || `https://www.google.com/search?q=${encodeURIComponent(openMatch[1].trim())}`;
      const label = knownUrl ? `🔗 Open ${openMatch[1].trim()}` : `🔍 Search: ${openMatch[1].trim()}`;
      return { reply: `Opening ${openMatch[1].trim()}`, quickAction: { label, url }, whatsappLink: null };
    }

    // "message/tell/whatsapp [name] [text]" or "message [name] on whatsapp [text]"
    // Also handles bare "whatsapp [name] [message]" where "whatsapp" is the verb
    const waMatch = message.match(/^(?:message|tell|whatsapp|send)\s+(.+?)\s+(?:on\s+whatsapp\s*,?\s*|saying\s+)(.+)/i) ||
                    message.match(/^(?:message|tell|whatsapp|send)\s+(.+?)\s+on\s+whatsapp$/i) ||
                    (/^whatsapp\s+/i.test(message) && message.match(/^whatsapp\s+(\S+)\s+(.+)/i));
    if (waMatch) {
      const contactName = waMatch[1].replace(/\s+on$/i, '').trim();
      const messageText = waMatch[2]?.trim() || '';
      const c = this.matchContact(await getContacts(), contactName);
      if (c?.phone) {
        if (!messageText) {
          return { reply: `What should I tell ${c.name}?`, quickAction: null, whatsappLink: null };
        }
        const dialCode = c.phone.length === 10 ? `91${c.phone}` : c.phone;
        const url = `https://wa.me/${dialCode}?text=${encodeURIComponent(messageText)}`;
        return { reply: `Message to ${c.name}: "${messageText}"`, quickAction: null, whatsappLink: { url } };
      }
      return { reply: `I don't have ${contactName}'s number. Save it with "save ${contactName}'s number [number]"`, quickAction: null, whatsappLink: null };
    }

    // "set timer [X] mins/seconds"
    const timerMatch = message.match(/^set\s+(?:a\s+)?timer\s+(?:for\s+|to\s+)?(\d+)\s*(?:min|mins|minutes|sec|secs|seconds)/i);
    if (timerMatch) {
      const num = parseInt(timerMatch[1]);
      const isSeconds = /sec/i.test(timerMatch[0]);
      const label = isSeconds ? `⏱️ Set ${num}s timer` : `⏱️ Set ${num}min timer`;
      const query = isSeconds ? `set timer ${num} seconds` : `set timer ${num} minutes`;
      return { reply: `${num}-${isSeconds ? 'second' : 'minute'} timer`, quickAction: { label, url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }, whatsappLink: null };
    }

    // "save [name]'s number [number]" or "save contact [name] [number]"
    const saveMatch = message.match(/^save\s+(.+?)(?:'s)?\s+(?:number|phone|contact)\s+(\d[\d\s\-+]+)/i) ||
                      message.match(/^save\s+contact\s+(.+?)\s+(\d[\d\s\-+]+)/i);
    if (saveMatch) {
      const name  = saveMatch[1].trim();
      const phone = saveMatch[2].replace(/[\s\-]/g, '').replace(/^\+91/, '').replace(/^91(?=\d{10}$)/, '');
      await contactService.create(userId.toString(), { name, phone, relationship: 'contact' });
      contextCache.invalidate(userId);
      return { reply: `Saved ${name}'s number: ${phone}`, quickAction: null, whatsappLink: null };
    }

    return null; // not a direct action — fall through to LLM
  }

  // ── One-call web search — bypasses the classify LLM call entirely ─────────
  async handleSearchDirect(userId, chatId, message) {
    try {
      const { webSearchService } = await import('../search/webSearchService.js');
      const results = await webSearchService.search(message, 5);

      if (!results || results.length === 0) {
        return await this.handleConversation(userId, chatId, message);
      }

      const formatted = webSearchService.formatForLLM(results);
      const reply = await llm.call(
        `You are a helpful assistant. Answer the question using the search results. Be concise (2-4 sentences). Cite the source URL if relevant. No JSON — just plain text.`,
        `Question: ${message}\n\nSearch results:\n${formatted}`,
        0.3
      );

      await conversationMemory.addTurn(userId, 'user', message);
      await conversationMemory.addTurn(userId, 'assistant', reply);
      return { reply, quickAction: null, whatsappLink: null };
    } catch (error) {
      logger.error('Direct search failed', { error: error.message });
      return await this.handleConversation(userId, chatId, message);
    }
  }

  // ── Action mode — JSON format, full context, structured responses ─────────

  async handleAction(userId, chatId, message) {
    const now = istNow();
    const timeBlock = buildTimeBlock(now);
    const todayStr = now.toISOString().slice(0, 10);

    // ── Determine which optional context sections are needed ───────────────
    const wantsContacts = /contact|whatsapp|message\s+\w|phone|number|vcf|send.*to|\bcall\b|text\s+\w|\bsms\b|\btell\s+\w/i.test(message);
    const wantsJournal  = /journal|mood|feeling|reflect/i.test(message);
    const wantsDoc      = /pdf|document|summarize|paper|article/i.test(message);

    // ── Context cache: serve heavy Firestore reads from memory (30s TTL) ────
    const cached = contextCache.get(userId);
    let tasks, habits, calendarContext, expenseSummary, budgets;
    if (cached) {
      ({ tasks, habits, calendarContext, expenseSummary, budgets } = cached);
    } else {
      [tasks, habits, calendarContext, expenseSummary, budgets] = await Promise.all([
        taskService.getUserTasks(userId, 'pending'),
        habitService.getUserHabits(userId).catch(() => []),
        this.getCalendarContext(userId),
        expenseService.getMonthlySummary(userId),
        this.getBudgets(userId)
      ]);
      contextCache.set(userId, { tasks, habits, calendarContext, expenseSummary, budgets });
    }

    // ── Always-fresh fetches (conversation state, win flag, conditionals) ───
    const [recentTurns, memories, pendingSession, contacts, journalLines, activeDoc, winPending] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      this.getSession(userId),
      wantsContacts ? contactService.getUserContacts(userId).catch(() => []) : Promise.resolve([]),
      wantsJournal  ? this.getJournalLines(userId) : Promise.resolve(null),
      wantsDoc      ? this.getActiveDocContext(userId) : Promise.resolve(null),
      winsService.getWinPending(userId).catch(() => false)
    ]);

    if (pendingSession) await this.clearSession(userId);

    // ── Compact task block (single line) ───────────────────────────────────
    const overdueTasks  = tasks.filter(t => t.deadline && istDateStr(t.deadline) < todayStr);
    const dueTodayTasks = tasks.filter(t => t.deadline && istDateStr(t.deadline) === todayStr);
    const upcomingTasks = tasks.filter(t => !t.deadline || istDateStr(t.deadline) > todayStr);

    const fmtTask = t => {
      let deadline = '';
      if (t.deadline) {
        const d = t.deadline?.toDate ? t.deadline.toDate() : new Date(t.deadline);
        deadline = ` ${isNaN(d) ? '' : formatDate(d)}`;
      }
      return `${t.title}[${(t.priority || 'M')[0].toUpperCase()}]${deadline}`;
    };
    const taskParts = [];
    if (overdueTasks.length)  taskParts.push(`⚠️OVERDUE: ${overdueTasks.map(fmtTask).join(', ')}`);
    if (dueTodayTasks.length) taskParts.push(`TODAY: ${dueTodayTasks.map(fmtTask).join(', ')}`);
    if (upcomingTasks.length) taskParts.push(`UPCOMING: ${upcomingTasks.slice(0, 5).map(fmtTask).join(', ')}`);
    const taskBlock = `TASKS: ${taskParts.join(' | ') || 'none'}`;

    // ── Compact habit block (single line) ─────────────────────────────────
    const habitBlock = habits.length
      ? 'HABITS: ' + habits.map(h => `${isCompletedToday(h) ? '✅' : '❌'} ${h.name}(${h.streak || 0}d)`).join(' | ')
      : 'HABITS: none';

    // ── Expense block with budget flags ────────────────────────────────────
    const expenseBlock = Object.keys(expenseSummary).length
      ? 'SPENDING: ' + Object.entries(expenseSummary).map(([c, a]) => {
          const b = budgets[c];
          const pct = b ? Math.round((a / b) * 100) : null;
          const flag = pct !== null && pct >= 80 ? (pct >= 100 ? '⚠️OVER' : `${pct}%`) : '';
          return `${c} ₹${Math.round(a)}${b ? `/₹${b}${flag ? ' ' + flag : ''}` : ''}`;
        }).join(', ')
      : 'SPENDING: none this month';

    // ── Memory ─────────────────────────────────────────────────────────────
    const memBlk = this.selectMemories(memories, message)
      .map(m => `- ${m.key || m.category}: ${m.value}`).join('\n') || '(none)';

    // ── Proactive observations (cap at 5 to control token use) ────────────
    const observations = this.buildObservations(tasks, habits, expenseSummary, budgets, todayStr).slice(0, 5);

    // ── Contacts — names only for the LLM (phone lookup done in executeActions) ─
    const contactBlock = wantsContacts && contacts.length
      ? 'KNOWN CONTACTS: ' + contacts.slice(0, 10).map(c => c.name).join(', ')
        + (contacts.length > 10 ? ` (+${contacts.length - 10} more)` : '')
      : null;

    // ── Session ────────────────────────────────────────────────────────────
    const sessionBlock = pendingSession
      ? `FOLLOW-UP GOAL: ${pendingSession.waiting_for}\nPartial: ${JSON.stringify(pendingSession.partial || {})}\nUser is answering — complete the goal.`
      : null;

    // ── Assemble context ───────────────────────────────────────────────────
    const contextParts = [
      timeBlock,
      calendarContext ? calendarContext.trim() : null,
      taskBlock,
      habitBlock,
      expenseBlock,
      journalLines ? `JOURNAL:\n${journalLines}` : null,
      `MEMORY:\n${memBlk}`,
      contactBlock,
      activeDoc ? activeDoc.trim() : null,
      observations.length ? `OBSERVATIONS (surface if relevant):\n${observations.join('\n')}` : null,
      sessionBlock,
      winPending ? 'WIN_CAPTURE_PENDING: user is answering "what are you proud of today?" — store their reply as a win.' : null,
      `USER: ${message}`
    ].filter(Boolean).join('\n\n');

    // ── Assemble action system prompt — always includes schemas ───────────
    const budgetWarning = isTokenBudgetLow() ? '\nTOKEN BUDGET LOW: Keep reply under 20 words.' : '';
    const systemPrompt = ACTION_PROMPT_CORE + '\n\n' + ACTION_SCHEMAS + budgetWarning;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentTurns,
      { role: 'user', content: contextParts }
    ];

    let raw;
    try {
      raw = await llm.chat(messages, 0.3);
    } catch (error) {
      logger.error('Action LLM failed', { error: error.message });
      return "Something glitched on my end. Try that again?";
    }

    const parsed = this.parseResponse(raw);

    // ── Execute actions ────────────────────────────────────────────────────
    this._calendarNote = null;
    this._whatsappLink = null;
    this._searchResults = null;
    this._searchQuery = null;
    this._vcfContact = null;
    this._quickAction = null;
    this._listContent = null;
    await this.executeActions(userId, parsed.actions, tasks, habits, contacts);

    // ── Single cache invalidation check after all actions run ─────────────
    const MUTATING_ACTIONS = ['create_task', 'complete_task', 'delete_task',
      'create_expense', 'delete_expense', 'delete_all_expenses', 'delete_expenses_timerange',
      'create_habit', 'complete_habit', 'delete_habit', 'delete_all_habits',
      'create_contact', 'store_memory', 'create_calendar_event', 'store_win',
      'add_to_list', 'remove_from_list', 'create_list'];
    if (parsed.actions.some(a => MUTATING_ACTIONS.includes(a.type))) {
      contextCache.invalidate(userId);
    }

    // ── Win capture: clear pending flag once captured ──────────────────────
    if (winPending && parsed.actions?.some(a => a.type === 'store_win')) {
      winsService.clearWinPending(userId).catch(() => {});
    }

    // ── List display: override reply with formatted list ───────────────────
    if (this._listContent) {
      parsed.reply = this._listContent;
      this._listContent = null;
    }

    // ── Second LLM call: synthesise search results ─────────────────────────
    if (this._searchResults) {
      try {
        const searchContext = `The user asked: "${message}"\n\nI searched for: "${this._searchQuery}"\n\nSearch results:\n${this._searchResults}\n\nUsing these results, give a concise, direct answer (2-4 sentences). Cite the source URL or name if relevant. If results are insufficient, say so briefly and share what you do know.`;
        const grounded = await llm.call(
          `You are ${USER_NAME}'s chief-of-staff. Answer their question using these search results in 2-4 sentences. Cite the source name or URL briefly. No filler.`,
          searchContext,
          0.3
        );
        if (grounded) parsed.reply = grounded;
      } catch (err) {
        logger.error('Search synthesis LLM call failed', { error: err.message });
        parsed.reply = `I searched for "${this._searchQuery}" but couldn't synthesise the results right now. Here's what I found:\n\n${this._searchResults.slice(0, 500)}`;
      }
      this._searchResults = null;
      this._searchQuery = null;
    }

    await conversationMemory.addTurn(userId, 'user', message);
    await conversationMemory.addTurn(userId, 'assistant', parsed.reply);

    // ── Reply guardrails ───────────────────────────────────────────────────
    let reply = this.cleanReply(parsed.reply, recentTurns.length);

    // Calendar note appended inline (informational link, not a button)
    if (this._calendarNote) {
      reply += '\n' + this._calendarNote;
      this._calendarNote = null;
    }

    // VCF contact file: fire-and-forget, no need to wait
    if (this._vcfContact) {
      const { name, phone, email } = this._vcfContact;
      telegramService.sendContactVCF(chatId, name, phone, email).catch(err =>
        logger.error('sendContactVCF failed', { error: err.message })
      );
      this._vcfContact = null;
    }

    // Return side-channel results in the object rather than mutating instance fields
    const quickAction  = this._quickAction  || null;
    const whatsappLink = this._whatsappLink || null;
    this._quickAction  = null;
    this._whatsappLink = null;

    return { reply, quickAction, whatsappLink };
  }

  cleanReply(reply, priorTurnCount) {
    if (!reply) return "Got it.";
    // Strip filler phrases
    reply = reply
      .replace(/how can I (assist|help) you\??/gi, '')
      .replace(/is there anything else( I can (help|do|assist) (you )?with)?\??/gi, '')
      .trim();
    // Strip leading greeting on follow-up turns
    if (priorTurnCount > 0) {
      reply = reply.replace(/^(hi|hello|hey|good (morning|afternoon|evening))[!,]?\s*/i, '');
    }
    return reply.trim() || "Got it.";
  }

  parseResponse(raw) {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        return {
          reply: obj.reply || "Got it.",
          actions: Array.isArray(obj.actions) ? obj.actions : []
        };
      }
    } catch (e) {
      logger.debug('Failed to parse engine response', { raw: raw.slice(0, 200) });
    }
    return { reply: raw.trim() || "Got it.", actions: [] };
  }

  async executeActions(userId, actions, currentTasks, currentHabits, currentContacts = []) {
    // Contacts created in this same turn — checked before re-querying Firestore
    // so that create_contact + send_whatsapp in one turn works without a round-trip.
    const justCreatedContacts = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_task': {
            const deadline = parseDate(action.deadline_text);
            await taskService.create(userId, {
              title: action.title,
              date: deadline,
              priority: action.priority || 'medium',
              recurrence_text: action.recurrence_text || ''
            });
            break;
          }
          case 'create_habit': {
            await habitService.create(userId, {
              title: action.name,
              recurrence_text: action.recurrence || 'daily'
            });
            break;
          }
          case 'complete_habit': {
            const liveHabits = await habitService.getUserHabits(userId);
            const h = habitService.matchHabit(liveHabits, action.match);
            if (h) await habitService.markComplete(h._docId || h.id);
            else logger.warn('complete_habit: no match', { match: action.match });
            break;
          }
          case 'delete_habit': {
            const liveHabits = await habitService.getUserHabits(userId);
            const h = habitService.matchHabit(liveHabits, action.match);
            if (h) await habitService.delete(h._docId || h.id);
            else logger.warn('delete_habit: no match', { match: action.match });
            break;
          }
          case 'delete_all_habits': {
            const liveHabits = await habitService.getUserHabits(userId);
            if (liveHabits.length > 0) {
              await Promise.all(liveHabits.map(h => habitService.delete(h._docId || h.id)));
              logger.info('All habits deleted', { userId, count: liveHabits.length });
            }
            break;
          }
          case 'create_expense': {
            logger.info('create_expense action firing', { userId, amount: action.amount, category: action.category });
            await expenseService.create(userId, {
              amount: action.amount,
              category: action.category || 'other',
              description: action.description || ''
            });
            logger.info('create_expense saved', { userId, amount: action.amount, category: action.category });
            break;
          }
          case 'delete_all_expenses': {
            const count = await expenseService.deleteAll(userId);
            logger.info('delete_all_expenses completed', { userId, count });
            break;
          }
          case 'delete_expense': {
            const deleted = await expenseService.deleteByKeyword(userId, action.match || '');
            if (deleted === 0) logger.warn('delete_expense: no match found', { match: action.match });
            else logger.info('delete_expense completed', { userId, match: action.match, count: deleted });
            break;
          }
          case 'delete_expenses_timerange': {
            let count = 0;
            switch (action.period) {
              case 'today':      count = await expenseService.deleteToday(userId); break;
              case 'this_week':  count = await expenseService.deleteThisWeek(userId); break;
              case 'this_month': count = await expenseService.deleteThisMonth(userId); break;
              case 'all':        count = await expenseService.deleteAll(userId); break;
              default: logger.warn('delete_expenses_timerange: unknown period', { period: action.period });
            }
            logger.info('delete_expenses_timerange completed', { userId, period: action.period, count });
            break;
          }
          case 'delete_tasks_timerange': {
            let count = 0;
            switch (action.period) {
              case 'today':     count = await taskService.deleteToday(userId); break;
              case 'this_week': count = await taskService.deleteThisWeek(userId); break;
              case 'completed': count = await taskService.deleteCompleted(userId); break;
              default: logger.warn('delete_tasks_timerange: unknown period', { period: action.period });
            }
            logger.info('delete_tasks_timerange completed', { userId, period: action.period, count });
            break;
          }
          case 'create_contact': {
            const saved = await contactService.create(userId, {
              name: action.name,
              phone: action.phone || '',
              relationship: action.relationship || ''
            });
            // Track in-turn so send_whatsapp / save_to_phone can find it immediately
            justCreatedContacts.push(saved);
            break;
          }
          case 'save_to_phone': {
            // Resolve phone from action, or fall back to a just-created/stored contact
            let { name, phone, email } = action;
            if (!phone) {
              const match = contactService.matchContact(
                [...justCreatedContacts, ...(await contactService.getUserContacts(userId))],
                name
              );
              if (match) { phone = match.phone; email = email || match.email || ''; }
            }
            if (name && phone) {
              this._vcfContact = { name, phone, email: email || '' };
            } else {
              logger.warn('save_to_phone: missing name or phone', { name, phone });
            }
            break;
          }
          case 'send_whatsapp': {
            // Check same-turn creates first, then fall back to Firestore
            let contact = contactService.matchContact(justCreatedContacts, action.contact_name);
            if (!contact) {
              const liveContacts = await contactService.getUserContacts(userId);
              contact = contactService.matchContact(liveContacts, action.contact_name);
            }
            if (contact?.phone) {
              const dialCode = contact.phone.length === 10 ? `91${contact.phone}` : contact.phone;
              const url = `https://wa.me/${dialCode}?text=${encodeURIComponent(action.message)}`;
              this._whatsappLink = { url, contactName: contact.name, message: action.message };
            } else {
              // Don't mutate reply — LLM already wrote a coherent response.
              // Log so we can diagnose if contacts aren't loading.
              logger.warn('send_whatsapp: contact not found or no phone', {
                contact_name: action.contact_name,
                justCreatedCount: justCreatedContacts.length,
                contact: contact?.name
              });
            }
            break;
          }
          case 'store_memory': {
            await memoryService.store(userId, {
              key: action.key,
              value: action.value,
              description: action.value
            });
            break;
          }
          case 'complete_task': {
            const t = this.matchTask(currentTasks, action.match);
            if (t) await taskService.updateStatus(t.id, 'completed');
            break;
          }
          case 'delete_task': {
            const t = this.matchTask(currentTasks, action.match);
            if (t) await taskService.delete(t.id);
            break;
          }
          case 'ask_followup': {
            await this.setSession(userId, {
              waiting_for: action.waiting_for || 'info',
              partial: action.partial || {},
              createdAt: new Date()
            });
            break;
          }
          case 'create_calendar_event': {
            const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
            const startTime = parseDate(action.date);
            const endTime = action.end_date ? parseDate(action.end_date) : null;
            if (startTime) {
              const result = await googleCalendarService.createEvent(userId, {
                title: action.title || 'Event',
                startTime,
                endTime,
                description: action.description || '',
                location: action.location || ''
              });
              if (result?.error === 'not_connected') {
                this._calendarNote = '(Calendar not connected — use /connectcalendar to link Google Calendar)';
              } else if (result?.success && result.link) {
                this._calendarNote = `📅 [View in Google Calendar](${result.link})`;
              }
            }
            break;
          }
          case 'phone_call': {
            let callContacts = [...justCreatedContacts, ...currentContacts];
            let callContact = contactService.matchContact(callContacts, action.contact_name);
            if (!callContact) {
              // Fallback: contacts weren't pre-loaded (wantsContacts regex missed) — fetch live
              const liveContacts = await contactService.getUserContacts(userId);
              callContact = contactService.matchContact(liveContacts, action.contact_name);
            }
            if (callContact?.phone) {
              const dialCode = callContact.phone.length === 10 ? `+91${callContact.phone}` : `+${callContact.phone}`;
              this._quickAction = { label: `📞 Call ${callContact.name}`, url: `tel:${dialCode}` };
            } else {
              logger.warn('phone_call: contact not found', { contact_name: action.contact_name });
            }
            break;
          }
          case 'send_sms': {
            let smsContacts = [...justCreatedContacts, ...currentContacts];
            let smsContact = contactService.matchContact(smsContacts, action.contact_name);
            if (!smsContact) {
              const liveContacts = await contactService.getUserContacts(userId);
              smsContact = contactService.matchContact(liveContacts, action.contact_name);
            }
            if (smsContact?.phone) {
              const dialCode = smsContact.phone.length === 10 ? `+91${smsContact.phone}` : `+${smsContact.phone}`;
              const body = encodeURIComponent(action.message || '');
              this._quickAction = { label: `💬 SMS ${smsContact.name}`, url: `sms:${dialCode}?body=${body}` };
            } else {
              logger.warn('send_sms: contact not found', { contact_name: action.contact_name });
            }
            break;
          }
          case 'navigate': {
            const dest = encodeURIComponent(action.destination || '');
            this._quickAction = { label: `🗺️ Navigate to ${action.destination}`, url: `https://www.google.com/maps/dir/?api=1&destination=${dest}` };
            break;
          }
          case 'play_music': {
            const q = encodeURIComponent(action.query || '');
            this._quickAction = { label: `🎵 Play on YouTube Music`, url: `https://music.youtube.com/search?q=${q}` };
            break;
          }
          case 'web_open': {
            const key = (action.url_or_query || '').toLowerCase().trim();
            const knownUrl = Object.entries(APP_URLS).find(([app]) => key.includes(app))?.[1];
            const url = knownUrl || `https://www.google.com/search?q=${encodeURIComponent(action.url_or_query || '')}`;
            const label = knownUrl ? `🔗 Open ${action.url_or_query}` : `🔍 Search: ${action.url_or_query}`;
            this._quickAction = { label, url };
            break;
          }
          case 'set_timer': {
            const mins = Math.max(1, parseInt(action.minutes) || 5);
            const label = action.label ? `⏱️ ${mins}min — ${action.label}` : `⏱️ Set ${mins}min timer`;
            this._quickAction = { label, url: `https://www.google.com/search?q=set+timer+${mins}+minutes` };
            break;
          }
          case 'web_search': {
            try {
              const { webSearchService } = await import('../search/webSearchService.js');
              const results = await webSearchService.search(action.query || '');
              this._searchResults = webSearchService.formatForLLM(results);
              this._searchQuery = action.query || '';
              logger.info('web_search completed', { query: action.query, resultCount: results.length });
            } catch (err) {
              logger.error('web_search action failed', { error: err.message });
              this._searchResults = null;
            }
            break;
          }
          case 'store_win': {
            if (action.text?.trim()) {
              await winsService.storeWin(userId, action.text.trim());
            }
            break;
          }
          case 'create_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            const list = await sharedListService.createList(userId, action.name || 'My List');
            logger.info('List created via action', { userId, name: list.name });
            break;
          }
          case 'add_to_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            await sharedListService.addItem(userId, action.list_name || '', action.item || '');
            break;
          }
          case 'remove_from_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            await sharedListService.removeItem(userId, action.list_name || '', action.item || '');
            break;
          }
          case 'show_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            const list = await sharedListService.findList(userId, action.list_name || '');
            this._listContent = sharedListService.formatList(list);
            break;
          }
          case 'share_list': {
            const { sharedListService } = await import('../lists/sharedListService.js');
            await sharedListService.shareList(userId, action.list_name || '', action.share_with || '');
            break;
          }
          default:
            logger.debug('Unknown action type', { type: action.type });
        }
      } catch (error) {
        logger.error('Action execution failed', { action: action.type, error: error.message });
      }
    }
  }

  // ── Context helpers ──────────────────────────────────────────────────────

  buildObservations(tasks, habits, expenseSummary, budgets, todayStr) {
    const obs = [];

    // Overdue tasks
    tasks
      .filter(t => t.deadline && istDateStr(t.deadline) < todayStr)
      .forEach(t => obs.push(`⚠️ OVERDUE: "${t.title}" was due ${formatDate(t.deadline)}`));

    // Due today
    tasks
      .filter(t => t.deadline && istDateStr(t.deadline) === todayStr)
      .forEach(t => obs.push(`📌 DUE TODAY: "${t.title}"`));

    // Habits not done
    const pendingHabits = habits.filter(h => !isCompletedToday(h));
    if (pendingHabits.length) {
      obs.push(`🎯 HABITS PENDING: ${pendingHabits.map(h => h.name).join(', ')}`);
    }

    // Streak at risk: daily habit, has streak > 0, last completed more than 1 day ago
    habits.forEach(h => {
      if ((h.frequency === 'daily' || h.intervalDays === 1) && h.streak > 0 && !isCompletedToday(h)) {
        const last = h.lastCompleted?.toDate ? h.lastCompleted.toDate() : (h.lastCompleted ? new Date(h.lastCompleted) : null);
        if (last && (Date.now() - last.getTime()) > 24 * 60 * 60 * 1000) {
          obs.push(`🔥 STREAK AT RISK: ${h.name} (${h.streak} day streak)`);
        }
      }
    });

    // Budget alerts intentionally omitted here — spending data with ⚠️ flags
    // is already in the THIS MONTH'S SPENDING context block. Repeating it in
    // observations caused the LLM to mention budget in every single reply.

    return obs;
  }

  async getActiveDocContext(userId) {
    try {
      const { pdfService } = await import('../documents/pdfService.js');
      const doc = await pdfService.getActiveDoc(userId);
      if (!doc) return '';
      pdfService.touchActiveDoc(userId).catch(() => {});
      return `ACTIVE DOCUMENT (answer questions about it using this content):\nSummary: ${doc.summary}\n\nContent excerpt:\n${doc.text}`;
    } catch {
      return '';
    }
  }

  async getCalendarContext(userId) {
    try {
      const tokenDoc = await db.collection('google_tokens').doc(userId.toString()).get();
      if (!tokenDoc.exists) return '';
      const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
      const events = await googleCalendarService.listTodayEvents(userId);
      if (!Array.isArray(events) || !events.length) return 'TODAY\'S CALENDAR: (no events)';
      const lines = events.map(e => {
        const t = new Date(e.start);
        const time = isNaN(t) ? e.start : t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        return `- ${e.title} at ${time}${e.location ? ` @ ${e.location}` : ''}`;
      }).join('\n');
      return `TODAY'S CALENDAR:\n${lines}`;
    } catch {
      return '';
    }
  }

  async getJournalLines(userId) {
    try {
      const { journalService } = await import('../journal/journalService.js');
      const entries = await journalService.getUserEntries(userId, 7);
      if (!entries || !entries.length) return '';
      return entries.slice(0, 3).map(e => {
        const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
        const label = e.title || (e.content || '').slice(0, 60);
        return `- "${label}" (${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })})`;
      }).join('\n');
    } catch {
      return '';
    }
  }

  async getBudgets(userId) {
    try {
      const { budgetService } = await import('../expenses/budgetService.js');
      return budgetService.getBudgets(userId);
    } catch {
      return { food: 8000, travel: 5000, shopping: 5000, education: 3000, health: 3000, other: 3000 };
    }
  }

  selectMemories(memories, message, topN = 5) {
    if (!memories.length) return [];
    const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const pinned = memories.filter(m => m.always);
    const rest = memories.filter(m => !m.always);
    const scored = rest.map(m => {
      const hay = `${m.key} ${m.value}`.toLowerCase();
      const score = words.filter(w => hay.includes(w)).length;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const slots = Math.max(0, topN - pinned.length);
    return [...pinned, ...scored.slice(0, slots).map(s => s.m)];
  }

  matchTask(tasks, matchText) {
    if (!matchText || !tasks.length) return null;
    const words = matchText.toLowerCase().split(/\s+/);
    let best = null, bestScore = 0;
    for (const t of tasks) {
      const title = (t.title || '').toLowerCase();
      const score = words.filter(w => w.length > 2 && title.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return bestScore > 0 ? best : null;
  }

  matchContact(contacts, name) {
    if (!name || !contacts?.length) return null;
    const target = name.toLowerCase().trim();
    return contacts.find(c => c.name.toLowerCase() === target) ||
           contacts.find(c => c.name.toLowerCase().split(' ')[0] === target) ||
           contacts.find(c => c.name.toLowerCase().startsWith(target)) ||
           contacts.find(c => c.name.toLowerCase().includes(target)) ||
           null;
  }

  // ── Conversation mode helpers ─────────────────────────────────────────────

  getTimeContext() {
    const now = new Date();
    const tz = USER_TIMEZONE;
    const options = { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz };
    const timeStr = now.toLocaleString('en-IN', options);
    const localHour = parseInt(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: tz }), 10);
    let period = 'morning';
    if (localHour >= 12 && localHour < 17) period = 'afternoon';
    else if (localHour >= 17 && localHour < 21) period = 'evening';
    else if (localHour >= 21 || localHour < 5) period = 'night';
    return `${timeStr} (${period})`;
  }

  async getQuickStatus(userId) {
    try {
      const tasks = await taskService.getUserTasks(userId, 'pending');
      const overdue = tasks.filter(t => t.deadline && new Date(t.deadline?.toDate ? t.deadline.toDate() : t.deadline) < new Date());
      if (!tasks.length) return null;
      let s = '';
      if (overdue.length) s += `${overdue.length} overdue. `;
      s += `${tasks.length} pending.`;
      return s.trim() || null;
    } catch { return null; }
  }

  // ── Routine engine (zero LLM tokens) ────────────────────────────────────────

  async checkRoutine(message, userId) {
    const msgLower = (message || '').toLowerCase().trim();
    for (const [trigger, steps] of Object.entries(ROUTINE_TRIGGERS)) {
      if (msgLower.includes(trigger)) {
        return await this.executeRoutine(steps, userId);
      }
    }
    return null;
  }

  async executeRoutine(steps, userId) {
    const parts = [];
    const now = new Date();
    const todayStr = istNow().toISOString().slice(0, 10);

    for (const step of steps) {
      try {
        switch (step) {
          case 'calendar_today': {
            try {
              const { googleCalendarService } = await import('../calendar/googleCalendarService.js');
              const events = await googleCalendarService.listTodayEvents(userId);
              if (events?.length) {
                const list = events.map(e => {
                  const t = new Date(e.start);
                  const time = isNaN(t) ? e.start : t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: USER_TIMEZONE });
                  return `${e.title} at ${time}`;
                }).join(', ');
                parts.push(`Calendar: ${list}.`);
              } else {
                parts.push('Nothing on your calendar today.');
              }
            } catch { parts.push('Calendar not connected.'); }
            break;
          }
          case 'tasks_pending': {
            const tasks = await taskService.getUserTasks(userId, 'pending');
            if (tasks.length) {
              const overdue = tasks.filter(t => t.deadline && istDateStr(t.deadline) < todayStr);
              const preview = tasks.slice(0, 3).map(t => t.title).join(', ');
              parts.push(`${tasks.length} pending task${tasks.length !== 1 ? 's' : ''}${overdue.length ? `, ${overdue.length} overdue` : ''}: ${preview}.`);
            } else {
              parts.push('No pending tasks — clear slate.');
            }
            break;
          }
          case 'tasks_due_today': {
            const tasks = await taskService.getUserTasks(userId, 'pending');
            const dueToday = tasks.filter(t => t.deadline && istDateStr(t.deadline) === todayStr);
            parts.push(dueToday.length
              ? `Due today: ${dueToday.map(t => t.title).join(', ')}.`
              : 'Nothing due today.');
            break;
          }
          case 'habits_status': {
            const habits = await habitService.getUserHabits(userId).catch(() => []);
            if (habits.length) {
              const done = habits.filter(h => isCompletedToday(h));
              const preview = habits.slice(0, 3).map(h => `${h.name} (${h.streak || 0}d)`).join(', ');
              parts.push(`Habits: ${done.length}/${habits.length} done today. ${preview}.`);
            }
            break;
          }
          case 'tasks_completed_today': {
            const completed = await taskService.getUserTasks(userId, 'completed');
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayDone = completed.filter(t => {
              const at = t.completedAt?.toDate ? t.completedAt.toDate() : new Date(t.completedAt || 0);
              return at >= startOfDay;
            });
            parts.push(todayDone.length
              ? `Completed today: ${todayDone.map(t => t.title).join(', ')}.`
              : 'Nothing completed today yet.');
            break;
          }
          case 'expenses_today': {
            const summary = await expenseService.getMonthlySummary(userId);
            const total = Object.values(summary).reduce((a, b) => a + b, 0);
            if (total > 0) parts.push(`Month spend so far: ₹${Math.round(total)}.`);
            break;
          }
          case 'tasks_week': {
            const tasks = await taskService.getUserTasks(userId, 'pending');
            parts.push(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} pending.`);
            break;
          }
          case 'expenses_week': {
            const summary = await expenseService.getMonthlySummary(userId);
            const total = Object.values(summary).reduce((a, b) => a + b, 0);
            if (total > 0) {
              const breakdown = Object.entries(summary).map(([c, a]) => `${c} ₹${Math.round(a)}`).join(', ');
              parts.push(`Month spending: ₹${Math.round(total)} — ${breakdown}.`);
            }
            break;
          }
          case 'habits_week': {
            const habits = await habitService.getUserHabits(userId).catch(() => []);
            if (habits.length) {
              const top = [...habits].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
              parts.push(`Best streak: ${top.name} at ${top.streak || 0} days.`);
            }
            break;
          }
        }
      } catch (err) {
        logger.error('executeRoutine step failed', { step, error: err.message });
      }
    }

    return parts.length ? parts.join(' ') : null;
  }

  // ── Conversation mode — free-form, personality-first responses ────────────

  async handleConversation(userId, chatId, message) {
    // ── Routine check: zero LLM tokens for recognised phrases ────────────────
    const routineResult = await this.checkRoutine(message, userId);
    if (routineResult) {
      await conversationMemory.addTurn(userId, 'user', message);
      await conversationMemory.addTurn(userId, 'assistant', routineResult);
      return { reply: routineResult, quickAction: null, whatsappLink: null };
    }

    const [recentTurns, memories, winPending] = await Promise.all([
      conversationMemory.getRecentTurns(userId),
      memoryService.getUserMemories(userId),
      winsService.getWinPending(userId).catch(() => false)
    ]);

    // Win capture: user answered the evening "what are you proud of?" prompt
    let winContext = '';
    if (winPending && message.trim().length > 3) {
      try {
        await winsService.storeWin(userId, message.trim());
        await winsService.clearWinPending(userId);
        winContext = `\n\nWIN_JUST_CAPTURED: The user just shared their win: "${message.trim()}". Celebrate it briefly and warmly — one sentence is enough.`;
      } catch (err) {
        logger.error('Win capture in conversation mode failed', { error: err.message });
      }
    }

    const memBlk = this.selectMemories(memories, message, 6)
      .map(m => `- ${m.key || m.category}: ${m.value}`).join('\n');

    const quickStatus = await this.getQuickStatus(userId).catch(() => null);
    const timeCtx = this.getTimeContext();

    const contextMessage = [
      `Current: ${timeCtx}`,
      quickStatus ? `Quick status: ${quickStatus}` : null,
      memBlk ? `About ${USER_NAME}:\n${memBlk}` : null,
      winContext || null,
      `Message: ${message}`
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: CONVERSATION_PROMPT },
      ...recentTurns,
      { role: 'user', content: contextMessage }
    ];

    let reply;
    try {
      reply = await llm.chat(messages, 0.8);
    } catch (err) {
      logger.error('Conversation LLM failed', { error: err.message });
      return "Something glitched on my end. Try again?";
    }

    // Strip any JSON leak (LLM sometimes falls back to JSON even with plain text instruction)
    if (reply?.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0]);
        reply = parsed.reply || reply;
      } catch { /* use raw reply */ }
    }

    await conversationMemory.addTurn(userId, 'user', message);
    await conversationMemory.addTurn(userId, 'assistant', reply || 'Got it.');
    return { reply: this.cleanReply(reply, recentTurns.length), quickAction: null, whatsappLink: null };
  }
}

export const conversationEngine = new ConversationEngine();
