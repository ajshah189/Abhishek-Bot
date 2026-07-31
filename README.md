# Personal AI Executive Assistant (Telegram)

Your second brain on Telegram. Natural language task management, expense tracking, habits, contacts, calendar, voice, and more — all powered by Groq + Firebase, deployable in ~5 minutes.

## Features

- **Natural language** — "spent ₹450 on dinner", "remind me Friday 9am", "call Mom"
- **Tasks** — create, complete, delete, time-range cleanup
- **Expenses** — log, summarise, budget warnings, receipt scanning (photo)
- **Habits** — daily tracking with streaks
- **Contacts** — save contacts, send WhatsApp, call/SMS via deep links, export .vcf
- **Calendar** — Google Calendar integration
- **Voice** — voice notes in Telegram + PWA voice assistant
- **Web search** — DDG-backed live search with LLM synthesis
- **Memory** — long-term key-value memory, journal, notes
- **Daily/evening briefs** — automated morning and evening summaries
- **Phone deep links** — call, SMS, navigate, play music, open apps, set timer
- **PDF summarisation** — upload a PDF, ask questions about it

## 5-Minute Setup

### Prerequisites

- Node.js 20+
- A [Telegram bot](https://t.me/BotFather) token
- A [Firebase](https://console.firebase.google.com) project (free Spark plan is enough)
- A [Groq](https://console.groq.com) API key (free)

### 1 — Clone & Install

```bash
git clone https://github.com/your-username/abhishek-assistant-telegram
cd abhishek-assistant-telegram
npm install
```

### 2 — Run Setup Wizard

```bash
node backend/setup/setupWizard.js
```

The wizard asks for your credentials and writes `.env` and `user-config.json` for you. Have these ready:

| What | Where to get it |
|------|----------------|
| Telegram bot token | [@BotFather](https://t.me/BotFather) → `/newbot` |
| Your Telegram user ID | Send `/id` to [@userinfobot](https://t.me/userinfobot) |
| Groq API key | [console.groq.com](https://console.groq.com) |
| Firebase Admin key | Firebase Console → Project Settings → Service Accounts → Generate New Private Key |
| Firebase Web config | Firebase Console → Project Settings → Your apps → Web app → SDK config |

### 3 — Run Locally

```bash
npm run dev
```

### 4 — Expose with ngrok (for Telegram webhook)

```bash
ngrok http 8080
```

Copy the `https://` URL, then set it in `.env`:

```
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok-free.app/webhook
```

Then register the webhook:

```bash
node backend/setup/setupWebhook.js
```

### 5 — Message Your Bot

Open Telegram, find your bot, say "hi". Done.

---

## Cloud Deployment (Google Cloud Run)

```bash
gcloud run deploy personal-assistant \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars "$(grep -v '^#' .env | grep -v '^$' | tr '\n' ',')"
```

Or see [`DEPLOYMENT.md`](DEPLOYMENT.md) for a step-by-step walkthrough.

---

## Dashboard (Voice PWA)

The `dashboard/` directory is a React/Vite app. The setup wizard writes all `VITE_*` env vars automatically.

```bash
cd dashboard
npm install
npm run dev        # local preview
npm run build      # build for production
firebase deploy    # deploy to Firebase Hosting
```

---

## Telegram Commands

| Command | What it does |
|---------|-------------|
| `/tasks` | Pending tasks |
| `/habits` | Today's habits |
| `/expenses` | Monthly expense summary |
| `/daily` | Morning brief |
| `/evening` | Evening review |
| `/calendar` | Upcoming events |
| `/contacts` | Contact list |
| `/news [topic]` | Latest news |
| `/apps` | Phone deep-link shortcuts |
| `/savecontact [name] [phone]` | Save contact + send .vcf |
| `/voice` | Open voice assistant |
| `/help` | Full command list |

---

## Architecture

```
Telegram ──► Webhook (Express)
                │
                ▼
         ConversationEngine
         (Groq LLM + context)
                │
         ┌──────┼──────┐
         ▼      ▼      ▼
      Tasks  Expenses  Habits
      Contacts  Calendar  Search
                │
                ▼
         Firebase Firestore
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather |
| `GROQ_API_KEY` | ✅ | Groq API key |
| `FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | ✅ | Admin SDK private key |
| `FIREBASE_CLIENT_EMAIL` | ✅ | Admin SDK client email |
| `USER_NAME` | ✅ | Your name (used in bot personality) |
| `USER_TIMEZONE` | ✅ | IANA timezone (e.g. `Asia/Kolkata`) |
| `OWNER_TELEGRAM_ID` | ✅ | Your Telegram user ID |
| `VOICE_API_KEY` | ✅ | API key for the voice dashboard |
| `DASHBOARD_URL` | — | Your deployed dashboard URL |
| `VITE_USER_ID` | — | Same as OWNER_TELEGRAM_ID (dashboard) |
| `VITE_API_BASE` | — | Backend URL (dashboard) |
| `VITE_VOICE_API_KEY` | — | Same as VOICE_API_KEY (dashboard) |
| `VITE_FIREBASE_*` | — | Firebase web app config (dashboard) |
| `GOOGLE_CLIENT_ID` | — | Google OAuth (Calendar) |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth (Calendar) |

See [`.env.example`](.env.example) for the full list.

---

## Tech Stack

- **Backend:** Node.js 20 (ESM), Express
- **AI:** Groq (`llama-3.3-70b-versatile` + `whisper-large-v3-turbo`)
- **Database:** Firebase Firestore
- **Messaging:** Telegram Bot API
- **Hosting:** Google Cloud Run
- **Dashboard:** React + Vite + Firebase Hosting
