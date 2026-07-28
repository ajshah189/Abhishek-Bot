import { config } from 'dotenv';
config();

import express from 'express';
import { telegramHandler } from './services/telegram/handler.js';
import { reminderPoller } from './services/reminders/reminderPoller.js';
import { logger } from './utils/logger.js';
// import commandRoutes from './routes/commands.js';  // COMMENT OUT
// import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';  // COMMENT OUT
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 8080;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'your-secret';

app.use(express.json());

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message });
  process.exit(1);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Webhook
app.post('/webhook', async (req, res) => {
  try {
    const result = await telegramHandler.handleUpdate(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Webhook error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`🚀 Telegram bot listening on port ${PORT}`);

  try {
    reminderPoller.start();
  } catch (e) {
    logger.error('Reminder error', { error: e.message });
  }
});

process.on('SIGTERM', () => {
  logger.info('Shutting down');
  reminderPoller.stop();
  server.close(() => process.exit(0));
});
