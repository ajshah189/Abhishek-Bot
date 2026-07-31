import { config } from 'dotenv';
config();

import groq from '../../config/groq.js';
import { logger } from '../../utils/logger.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const DAILY_TOKEN_LIMIT = 100000;

// ── In-memory daily counters (reset at midnight) ──────────────────────────────
let dailyTokensUsed = 0;
let dailyCallCount  = 0;
let lastResetDate   = new Date().toDateString();

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    logger.info('Daily token counter reset', { date: today, previousUsed: dailyTokensUsed, previousCalls: dailyCallCount });
    dailyTokensUsed = 0;
    dailyCallCount  = 0;
    lastResetDate   = today;
  }
}

export function getTokenStats() {
  resetIfNewDay();
  const remaining  = Math.max(0, DAILY_TOKEN_LIMIT - dailyTokensUsed);
  const avgPerCall = dailyCallCount > 0 ? Math.round(dailyTokensUsed / dailyCallCount) : 0;
  const estLeft    = avgPerCall > 0 ? Math.floor(remaining / avgPerCall) : '∞';
  return {
    used:        dailyTokensUsed,
    remaining,
    limit:       DAILY_TOKEN_LIMIT,
    calls:       dailyCallCount,
    avgPerCall,
    estCallsLeft: estLeft
  };
}

export function isTokenBudgetLow() {
  resetIfNewDay();
  return (DAILY_TOKEN_LIMIT - dailyTokensUsed) < 10000;
}

export class LLMAdapter {
  async call(systemPrompt, userMessage, temperature = 0.7) {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature
    );
  }

  async chat(messages, temperature = 0.7) {
    resetIfNewDay();
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages,
        temperature,
        max_tokens: 1024
      });

      const usage = completion.usage;
      if (usage) {
        const tokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
        dailyTokensUsed += tokens;
        dailyCallCount++;
        if (dailyTokensUsed > DAILY_TOKEN_LIMIT * 0.9) {
          logger.warn('Token budget above 90%', { used: dailyTokensUsed, limit: DAILY_TOKEN_LIMIT, calls: dailyCallCount });
        }
        logger.debug('LLM token usage', { prompt: usage.prompt_tokens, completion: usage.completion_tokens, dailyTotal: dailyTokensUsed });
      }

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      if (error.status === 429) {
        logger.warn('Groq rate limit hit', { error: error.message });
        return "I'm thinking a bit too fast right now — give me a few seconds and try again.";
      }
      logger.error('LLM call failed', { error: error.message });
      throw error;
    }
  }
}

export const llm = new LLMAdapter();
