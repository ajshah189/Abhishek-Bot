import { config } from 'dotenv';
config();

import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

// Register global error handlers BEFORE any heavy imports
// so a background-job failure never kills the HTTP server
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception (server stays up):', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled rejection (server stays up):', reason);
});

app.use(express.json());

// Root — Cloud Run startup/liveness probe hits GET / by default
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Health check (explicit path)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Telegram webhook — lazy-load handler so a Firebase init failure
// is a per-request 500 rather than a process crash at startup
app.post('/webhook', async (req, res) => {
  console.log('📨 Webhook received:', JSON.stringify(req.body).slice(0, 100));
  try {
    const { telegramHandler } = await import('./services/telegram/handler.js');
    const result = await telegramHandler.handleUpdate(req.body);
    console.log('✅ Handled');
    res.json(result);
  } catch (error) {
    console.error('❌ Webhook error:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// 404 catch-all
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Start listening — nothing after this line can crash the process
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown on SIGTERM (Cloud Run drain)
process.on('SIGTERM', () => {
  console.log('SIGTERM received — draining');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force-exit after 10s if connections don't drain
  setTimeout(() => process.exit(0), 10_000).unref();
});
