import { config } from 'dotenv';
config();

import express from 'express';
import { telegramHandler } from './services/telegram/handler.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Telegram webhook - THIS IS THE KEY PART
app.post('/webhook', async (req, res) => {
  console.log('📨 Webhook received!', JSON.stringify(req.body).slice(0, 100));
  try {
    const result = await telegramHandler.handleUpdate(req.body);
    console.log('✅ Handled successfully');
    res.json(result);
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Webhook URL: ${process.env.TELEGRAM_WEBHOOK_URL || 'NOT SET'}/webhook`);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught:', err.message, err.stack);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled:', err);
});

process.on('SIGTERM', () => {
  console.log('Shutting down');
  server.close(() => process.exit(0));
});
