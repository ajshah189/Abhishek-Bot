const levels = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG'
};

const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const log = {
    timestamp,
    level: levels[level],
    message,
    data
  };
  console.log(JSON.stringify(log));
};

export const logger = {
  error: (msg, data) => log('error', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  info: (msg, data) => log('info', msg, data),
  debug: (msg, data) => log('debug', msg, data)
};
