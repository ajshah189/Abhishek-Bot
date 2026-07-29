import * as chrono from 'chrono-node';
import { logger } from '../../utils/logger.js';

export function parseDate(text, referenceDate = new Date()) {
  if (!text) return null;
  try {
    const results = chrono.parse(text, referenceDate, { forwardDate: true });
    if (results.length > 0) {
      return results[0].start.date();
    }
  } catch (error) {
    logger.debug('Date parse failed', { text, error: error.message });
  }
  return null;
}

export function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: d.getHours() || d.getMinutes() ? 'numeric' : undefined,
    minute: d.getHours() || d.getMinutes() ? '2-digit' : undefined,
    hour12: true
  });
}
