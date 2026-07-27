# Abhishek Assistant - Personal AI Executive Assistant

Your second brain. On Telegram.

## Features

✅ **Intent-Based Processing** — Understands natural language automatically  
✅ **Task Management** — Create, track, complete tasks  
✅ **Expense Tracking** — Log spending, monthly summaries  
✅ **Reminders** — Smart reminders with auto-scheduling  
✅ **Memory System** — Store preferences, routines, relationships  
✅ **Notes & Journal** — Save thoughts, journal entries, reflections  
✅ **Calendar** — Manage events and meetings  
✅ **Search** — Search all notes, tasks, memories  
✅ **Daily Planner** — Automatic morning briefing  
✅ **Evening Review** — Automatic evening summary  
✅ **Habits** — Track daily habits with streaks  
✅ **Contacts** — Manage contacts with birthdays  
✅ **Commands** — Slash commands for quick access  

## Quick Start

### Prerequisites

- Node.js 18+
- Firebase project setup
- Telegram bot token
- Groq API key

### Setup

```bash
# Clone and install
git clone <repo>
cd abhishek-assistant-telegram
npm install

# Configure environment
cp .env.example .env
# Fill in your credentials in .env

# Run locally
npm run dev
```

### Environment Variables

```env
TELEGRAM_BOT_TOKEN=your-bot-token
GROQ_API_KEY=your-groq-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
# ... see .env.example for all vars
```

## Architecture

```
Backend (Node.js + Express)
        ↓
Intent Extractor (Groq/Claude LLM)
        ↓
Service Layer (Tasks, Expenses, Reminders, etc.)
        ↓
Firebase Firestore (Database)
Firebase Storage (Files)
        ↓
Telegram Bot API (Messages)
```

## API Routes

### Health Check
- `GET /health` — Server status

### Commands
- `GET /api/tasks?userId=xxx` — List tasks
- `GET /api/daily-brief?userId=xxx` — Get daily brief
- `GET /api/search?userId=xxx&query=xxx` — Search

## Telegram Commands

```
/tasks    — Show pending tasks
/daily    — Daily brief
/evening  — Evening review
/habits   — Show habits
/expenses — Monthly summary
/search <query> — Search
/help     — Show commands
/settings — Manage settings
```

## Natural Language Examples

```
"Gym tomorrow 6"                    → Creates reminder
"Spent ₹450 on dinner"              → Logs expense
"Need to submit assignment Friday"  → Creates task
"Remember I like Jain food"         → Stores memory
"Add Riya's number 9876543210"      → Creates contact
"What are my pending assignments?"  → Searches tasks
```

## Services

| Service | Purpose |
|---------|---------|
| TaskService | Create, manage, complete tasks |
| ExpenseService | Log and track expenses |
| ReminderService | Create and send reminders |
| MemoryService | Store long-term memory |
| NoteService | Save notes and ideas |
| JournalService | Journal entries and reflections |
| CalendarService | Manage events |
| ContactService | Manage contacts |
| SearchService | Global search across all data |
| PlannerService | Daily/evening summaries |
| ReminderPoller | Automatic reminder delivery |
| ScheduleService | Schedule daily tasks |

## Database Schema

All data stored in Firestore:

- `users` — User profiles and settings
- `tasks` — Tasks and to-dos
- `expenses` — Expense records
- `reminders` — Reminders
- `notes` — Notes
- `journal` — Journal entries
- `memories` — Long-term memory
- `habits` — Habit tracking
- `calendar` — Calendar events
- `contacts` — Contacts
- `conversation_logs` — Conversation history

## Deployment

### Google Cloud Run

```bash
gcloud functions deploy telegram-webhook \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated
```

Set these as Cloud Run secrets:
- `TELEGRAM_BOT_TOKEN`
- `GROQ_API_KEY`
- All `FIREBASE_*` vars

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** Firebase Firestore
- **Storage:** Firebase Cloud Storage
- **AI:** Groq (with Claude fallback)
- **Messaging:** Telegram Bot API
- **Hosting:** Google Cloud Run

## Future Features

- [ ] Google Calendar integration
- [ ] Gmail integration
- [ ] Voice note transcription (Whisper)
- [ ] PDF summarization
- [ ] Weekly analytics dashboard
- [ ] Habit analytics and charts
- [ ] Birthday reminders
- [ ] Location-based reminders
- [ ] Notion integration
- [ ] Weather updates

## License

MIT
