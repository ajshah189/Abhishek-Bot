export const telegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  apiUrl: 'https://api.telegram.org'
};

export const getTelegramApiUrl = (method) => {
  return `${telegramConfig.apiUrl}/bot${telegramConfig.botToken}/${method}`;
};
