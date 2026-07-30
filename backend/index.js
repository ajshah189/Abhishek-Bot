import { config } from 'dotenv';
config();

import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

// ── Global error guards ────────────────────────────────────────────────────
// Must be registered before any import that can fail, so background-job
// errors never kill the HTTP server.

process.on('exit', (code) => {
  // Visible in Cloud Run logs — tells us the exit code and when the process ended.
  console.log(`PROCESS EXITING code=${code} time=${new Date().toISOString()}`);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION (server stays up):', err.message, err.stack);
  // Do NOT call process.exit here — a background error must not kill the server.
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION (server stays up):', reason);
  // Do NOT call process.exit here.
});

// ── Express app ────────────────────────────────────────────────────────────

app.use(express.json());

// Root — Cloud Run startup/liveness probe hits GET / by default
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Explicit health-check path
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Telegram webhook — telegramHandler is lazy-loaded so a Firebase init
// failure is a per-request 500, not a startup crash
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

// 404 catch-all
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// ── Start ──────────────────────────────────────────────────────────────────
// Nothing below this line should throw synchronously or reject unhandled.
// Background jobs (reminderPoller, weeklyScheduler) are intentionally
// NOT started here — they require an always-on Cloud Run instance and
// will be wired in after stable deployment is confirmed.

const server = app.listen(PORT, () => {
  console.log(`BOOT_OK port=${PORT} time=${new Date().toISOString()}`);
});

// Graceful SIGTERM (Cloud Run sends this to drain the instance)
process.on('SIGTERM', () => {
  const ts = new Date().toISOString();
  console.log(`SIGTERM_RECEIVED time=${ts} — beginning graceful drain`);
  server.close(() => {
    console.log('SERVER_CLOSED — exiting cleanly');
    process.exit(0);
  });
  // Force-exit after 10s if existing connections don't drain in time
  setTimeout(() => {
    console.log('FORCE_EXIT after drain timeout');
    process.exit(0);
  }, 10_000).unref();
});
