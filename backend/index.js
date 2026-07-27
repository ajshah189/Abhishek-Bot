import { config } from 'dotenv';
config();

import express from 'express';
import { telegramHandler } from './services/telegram/handler.js';
import { reminderPoller } from './services/reminders/reminderPoller.js';
import { weeklyScheduler } from './services/scheduler/weeklyScheduler.js';
import { logger } from './utils/logger.js';
import commandRoutes from './routes/commands.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 8080;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'your-secret';

app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/webhook') {
    const signature = req.headers['x-telegram-bot-api-secret-sha256'];
    if (signature) {
      const hash = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('base64');

      if (hash !== signature) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use('/api', commandRoutes);

app.post('/webhook', async (req, res) => {
  try {
    logger.info('Webhook received', { update_id: req.body.update_id });
    const result = await telegramHandler.handleUpdate(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Webhook error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`🚀 Telegram bot listening on port ${PORT}`);
  console.log(`📱 Webhook: ${process.env.TELEGRAM_WEBHOOK_URL}/webhook`);

  reminderPoller.start();
  weeklyScheduler.initializeWeeklyReports();
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  reminderPoller.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
