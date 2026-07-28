import { config } from 'dotenv';
config();

import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.post('/webhook', (req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('Shutdown');
  server.close(() => process.exit(0));
});
