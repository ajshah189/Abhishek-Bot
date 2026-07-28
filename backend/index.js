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
  res.json({ status: 'ok' });
});

// Telegram webhook
app.post('/webhook', async (req, res) => {
  try {
    const result = await telegramHandler.handleUpdate(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Start
const server = app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);
  console.log(`🔗 Webhook: ${process.env.TELEGRAM_WEBHOOK_URL}/webhook`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
