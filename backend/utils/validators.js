export const isValidTelegramUpdate = (update) => {
  return update.message || update.callback_query;
};

export const extractUserMessage = (update) => {
  if (update.message?.text) return update.message.text;
  if (update.message?.caption) return update.message.caption;
  return null;
};

export const extractUserId = (update) => {
  return update.message?.from?.id || update.callback_query?.from?.id;
};

export const extractChatId = (update) => {
  return update.message?.chat?.id || update.callback_query?.message?.chat?.id;
};

export const sanitizeInput = (text) => {
  return text.trim().slice(0, 4096);
};
