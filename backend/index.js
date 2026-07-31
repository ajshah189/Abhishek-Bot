import { config } from 'dotenv';
config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 8080;

// ── Global error guards ────────────────────────────────────────────────────
// Registered before any import that can fail so background-job errors
// never kill the HTTP server.

process.on('exit', (code) => {
  console.log(`PROCESS EXITING code=${code} time=${new Date().toISOString()}`);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION (server stays up):', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION (server stays up):', reason);
});

// ── Middleware ─────────────────────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Fix 3 — restrict API CORS to the deployed dashboard origin only
const apiCors = cors({
  origin: process.env.DASHBOARD_URL || 'https://abhishek-assistant-d2e8f.web.app',
  methods: ['POST', 'OPTIONS']
});

// Fix 4 — per-user rate limiter (drop duplicate sends within 1 second)
const userLastMessage = new Map();

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.VOICE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Express routes ─────────────────────────────────────────────────────────

app.use(express.json());

// Cloud Run startup/liveness probe hits GET / by default
app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Telegram webhook — handler lazy-loaded so Firebase init failure is a
// per-request 500, not a startup crash
app.post('/webhook',
  // Fix 1 — verify Telegram webhook secret (set via TELEGRAM_WEBHOOK_SECRET env var)
  (req, res, next) => {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn('WEBHOOK_UNAUTHORIZED: bad or missing secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  },
  async (req, res) => {
    // Fix 4 — drop rapid duplicate messages from the same user (< 1 second apart)
    const incomingUserId = req.body?.message?.from?.id || req.body?.callback_query?.from?.id;
    if (incomingUserId) {
      const now = Date.now();
      const last = userLastMessage.get(incomingUserId) || 0;
      if (now - last < 1000) {
        return res.json({ ok: true });
      }
      userLastMessage.set(incomingUserId, now);
    }

    console.log('WEBHOOK_IN:', JSON.stringify(req.body).slice(0, 100));
    try {
      const { telegramHandler } = await import('./services/telegram/handler.js');
      const result = await telegramHandler.handleUpdate(req.body);
      console.log('WEBHOOK_OK');
      res.json(result);
    } catch (error) {
      console.error('WEBHOOK_ERR:', error.message, error.stack);
      res.status(500).json({ error: error.message });
    }
  }
);

// Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) {
    return res.status(400).send('<h2>Missing code or state. Close this and try again.</h2>');
  }
  try {
    const { handleCallback } = await import('./services/calendar/googleAuth.js');
    const { telegramService } = await import('./services/telegram/telegramService.js');
    const { db } = await import('./config/firebase.js');

    const result = await handleCallback(code, userId);
    if (result.success) {
      // Look up chatId so we can message the user
      try {
        const userDoc = await db.collection('users').doc(userId.toString()).get();
        const chatId = userDoc.data()?.telegramId;
        if (chatId) {
          await telegramService.sendMessage(chatId, '✅ Google Calendar connected! Try /calendar to see today\'s events.');
        }
      } catch (e) {
        console.error('OAuth: failed to notify user', e.message);
      }
      return res.send('<h2 style="font-family:sans-serif;color:green">✅ Google Calendar connected! You can close this tab and return to Telegram.</h2>');
    } else {
      return res.status(500).send(`<h2 style="font-family:sans-serif;color:red">❌ Authorization failed: ${result.error}</h2>`);
    }
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    return res.status(500).send('<h2 style="font-family:sans-serif;color:red">❌ Something went wrong. Please try again.</h2>');
  }
});

// ── Voice API ──────────────────────────────────────────────────────────────

// POST /api/voice — multipart: audio file + userId field
app.options('/api/voice', apiCors);
app.post('/api/voice', apiCors, requireApiKey, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const userId = req.body?.userId;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { voiceTranscriber } = await import('./services/voice/voiceTranscriber.js');
    const { conversationEngine } = await import('./services/ai/conversationEngine.js');

    const transcript = await voiceTranscriber.transcribeAudioBuffer(req.file.buffer, req.file.originalname || 'voice.webm');
    if (!transcript) return res.status(422).json({ error: 'Transcription failed or empty' });

    const result = await conversationEngine.process(userId, userId, transcript);
    const { reply, quickAction } = typeof result === 'string'
      ? { reply: result, quickAction: null }
      : result;
    res.json({ transcript, reply, quickAction });
  } catch (error) {
    console.error('API_VOICE_ERR:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/text — JSON: { message, userId }
app.options('/api/text', apiCors);
app.post('/api/text', apiCors, requireApiKey, async (req, res) => {
  try {
    const { message, userId } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { conversationEngine } = await import('./services/ai/conversationEngine.js');
    const result = await conversationEngine.process(userId, userId, message);
    const { reply, quickAction } = typeof result === 'string'
      ? { reply: result, quickAction: null }
      : result;
    res.json({ reply, quickAction });
  } catch (error) {
    console.error('API_TEXT_ERR:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// ── Start server ───────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`BOOT_OK port=${PORT} time=${new Date().toISOString()}`);
  // Start background jobs AFTER the HTTP server is listening.
  // Each is wrapped in try/catch — any failure logs and continues.
  startBackgroundJobs();
});

async function startBackgroundJobs() {
  // 1. Reminder poller (due reminders + deadline nudges every 60s)
  try {
    const { reminderPoller } = await import('./services/reminders/reminderPoller.js');
    reminderPoller.start();
    console.log('POLLER_STARTED');
  } catch (err) {
    console.error('POLLER_START_FAILED:', err.message);
  }

  // 2. Weekly report scheduler (Sunday 10:00 IST per user)
  try {
    const { weeklyScheduler } = await import('./services/scheduler/weeklyScheduler.js');
    await weeklyScheduler.initializeWeeklyReports();
    console.log('WEEKLY_SCHEDULER_STARTED');
  } catch (err) {
    console.error('WEEKLY_SCHEDULER_FAILED:', err.message);
  }

  // 3. Proactive daily/evening briefs (node-cron, per-user IST times)
  try {
    const { proactiveScheduler } = await import('./services/scheduler/proactiveScheduler.js');
    await proactiveScheduler.start();
    console.log('PROACTIVE_SCHEDULER_STARTED');
  } catch (err) {
    console.error('PROACTIVE_SCHEDULER_FAILED:', err.message);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  const ts = new Date().toISOString();
  console.log(`SIGTERM_RECEIVED time=${ts} — draining`);
  server.close(() => {
    console.log('SERVER_CLOSED — exiting cleanly');
    process.exit(0);
  });
  setTimeout(() => {
    console.log('FORCE_EXIT after drain timeout');
    process.exit(0);
  }, 10_000).unref();
});
