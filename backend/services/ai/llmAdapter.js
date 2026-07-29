import { config } from 'dotenv';
config();

import groq from '../../config/groq.js';
import { logger } from '../../utils/logger.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages,
        temperature,
        max_tokens: 1024
      });

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
