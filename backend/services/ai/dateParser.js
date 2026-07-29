import * as chrono from 'chrono-node';
import { logger } from '../../utils/logger.js';

// Maps natural-language recurrence text → { rule, intervalDays }
const RECURRENCE_MAP = [
  { pattern: /every\s+day|daily/i,        rule: 'daily',     intervalDays: 1 },
  { pattern: /weekday|mon.?fri/i,         rule: 'weekdays',  intervalDays: 1 },
  { pattern: /every\s+week|weekly/i,      rule: 'weekly',    intervalDays: 7 },
  { pattern: /every\s+monday/i,           rule: 'weekly:mon',intervalDays: 7 },
  { pattern: /every\s+tuesday/i,          rule: 'weekly:tue',intervalDays: 7 },
  { pattern: /every\s+wednesday/i,        rule: 'weekly:wed',intervalDays: 7 },
  { pattern: /every\s+thursday/i,         rule: 'weekly:thu',intervalDays: 7 },
  { pattern: /every\s+friday/i,           rule: 'weekly:fri',intervalDays: 7 },
  { pattern: /every\s+saturday/i,         rule: 'weekly:sat',intervalDays: 7 },
  { pattern: /every\s+sunday/i,           rule: 'weekly:sun',intervalDays: 7 },
  { pattern: /every\s+month|monthly/i,    rule: 'monthly',   intervalDays: 30 },
];

export function parseRecurrence(text) {
  if (!text) return null;
  for (const { pattern, rule, intervalDays } of RECURRENCE_MAP) {
    if (pattern.test(text)) return { rule, intervalDays };
  }
  return null;
}

// Given a recurrence rule and a reference date, return the next due date.
export function computeNextDue(rule, from = new Date()) {
  const d = new Date(from);
  if (!rule) return null;

  if (rule === 'daily') {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (rule === 'weekdays') {
    d.setDate(d.getDate() + 1);
    while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d;
  }
  if (rule === 'weekly' || rule.startsWith('weekly:')) {
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    const target = rule.includes(':') ? dayNames.indexOf(rule.split(':')[1]) : d.getDay();
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== target) d.setDate(d.getDate() + 1);
    return d;
  }
  if (rule === 'monthly') {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  return null;
}

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
