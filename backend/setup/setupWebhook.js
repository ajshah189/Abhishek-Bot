import { config } from 'dotenv';
config();

import axios from 'axios';

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

async function setupWebhook() {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: `${webhookUrl}/webhook`,
        secret_token: webhookSecret
      }
    );

    console.log('✅ Webhook set successfully:', response.data);
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.response?.data || error.message);
  }
}

setupWebhook();
