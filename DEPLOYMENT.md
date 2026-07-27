# Deployment Guide

## Local Development

```bash
npm run dev
```

Server runs on `http://localhost:8080`

## Expose to Internet (Testing)

### Option 1: Localtunnel (Easiest)

```bash
npm install -g localtunnel
lt --port 8080 --subdomain abhishek-assistant
```

Get URL: `https://abhishek-assistant.loca.lt`

### Option 2: ngrok

```bash
ngrok http 8080
```

Get URL from ngrok output.

## Set Telegram Webhook

```bash
node backend/setup/setupWebhook.js
```

This registers your bot with Telegram.

## Production Deployment (Google Cloud Run)

### Prerequisites

- Google Cloud account
- `gcloud` CLI installed
- Firebase project set up

### Deploy

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Deploy to Cloud Run
gcloud run deploy abhishek-assistant-telegram \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars TELEGRAM_BOT_TOKEN=...,GROQ_API_KEY=...,FIREBASE_PROJECT_ID=...

# Get the URL
gcloud run services describe abhishek-assistant-telegram --region us-central1
```

### Update Telegram Webhook

After deployment, update `.env` with the Cloud Run URL and run:

```bash
node backend/setup/setupWebhook.js
```

## Environment Variables (Cloud Run)

Set these as secrets in Cloud Run (copy values from your `.env`):

```
TELEGRAM_BOT_TOKEN=<from .env>
TELEGRAM_WEBHOOK_URL=https://YOUR_CLOUD_RUN_URL
TELEGRAM_WEBHOOK_SECRET=<your-secret-key>
GROQ_API_KEY=<from .env>
LLM_PROVIDER=groq
FIREBASE_PROJECT_ID=abhishek-assistant-d2e8f
FIREBASE_PRIVATE_KEY_ID=<from .env>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@abhishek-assistant-d2e8f.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=<from .env>
NODE_ENV=production
PORT=8080
```

## Monitoring

### View Logs (Cloud Run)

```bash
gcloud run services logs read abhishek-assistant-telegram --region us-central1 --limit 50
```

### Local Logs

All logs are JSON formatted:

```
{"timestamp":"...", "level":"INFO", "message":"..."}
```

## Troubleshooting

### Webhook not receiving messages

1. Check webhook is set:
   ```bash
   node backend/setup/setupWebhook.js
   ```

2. Verify URL is accessible:
   ```bash
   curl https://your-url/health
   ```

3. Check server logs for errors.

### Reminders not firing

1. Check reminder poller is running (see server logs)
2. Check Firestore has reminders with `status: pending`
3. Check user has valid `telegramId` in Firestore

### Intent extraction failing

1. Check Groq API key is valid
2. Check `LLM_PROVIDER=groq` is set
3. Review server logs for error details

## Database Backup

Firestore auto-backs up. To export manually:

```bash
gcloud firestore export gs://YOUR_BUCKET/backup-$(date +%s)
```

## Updating the Bot

```bash
# Pull latest changes
git pull

# Deploy to Cloud Run
gcloud run deploy abhishek-assistant-telegram --source .
```

---

Enjoy your personal AI assistant!
