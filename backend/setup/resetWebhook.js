import { config } from 'dotenv';
config();

import axios from 'axios';

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

async function resetWebhook() {
  try {
    console.log('🔄 Deleting existing webhook...');
    await axios.post(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      {}
    );
    console.log('✅ Webhook deleted');

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🔄 Setting new webhook...');
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: `${webhookUrl}/webhook`,
        secret_token: webhookSecret
      }
    );

    console.log('✅ Webhook reset successfully:', response.data);
  } catch (error) {
    console.error('❌ Failed to reset webhook:', error.response?.data || error.message);
  }
}

resetWebhook();
