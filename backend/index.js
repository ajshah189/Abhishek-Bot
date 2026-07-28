console.log('🚀 Starting server...');

try {
  console.log('Importing dotenv...');
  const { config } = await import('dotenv');
  config();
  console.log('✅ dotenv loaded');
} catch (e) {
  console.error('❌ dotenv error:', e.message);
  process.exit(1);
}

try {
  console.log('Importing express...');
  const express = await import('express');
  const app = express.default();

  console.log('Setting up routes...');
  app.use(express.default.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/webhook', (req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res) => res.status(404).json({ error: 'not found' }));

  console.log('Starting server...');
  const PORT = process.env.PORT || 8080;

  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📱 Webhook: ${process.env.TELEGRAM_WEBHOOK_URL}/webhook`);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down');
    process.exit(0);
  });

} catch (error) {
  console.error('❌ FATAL ERROR:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
