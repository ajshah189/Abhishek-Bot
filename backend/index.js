import { config } from 'dotenv';
config();

import express from 'express';

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

// ── Express routes ─────────────────────────────────────────────────────────

app.use(express.json());

// Cloud Run startup/liveness probe hits GET / by default
app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Telegram webhook — handler lazy-loaded so Firebase init failure is a
// per-request 500, not a startup crash
app.post('/webhook', async (req, res) => {
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
