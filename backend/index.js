console.log('🚀 Starting server...');

const express = await import('express');
const app = express.default();

app.use(express.default.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhook', (req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📱 Webhook: ${process.env.TELEGRAM_WEBHOOK_URL}/webhook`);
});

// Keep server alive
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT:', error.message, error.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED:', reason);
});

process.on('SIGTERM', () => {
  console.log('Shutdown');
  server.close(() => process.exit(0));
});

// Prevent process from exiting
setInterval(() => {}, 1000);
