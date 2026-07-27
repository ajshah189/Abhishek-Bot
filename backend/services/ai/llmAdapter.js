import groq from '../../config/groq.js';
import { logger } from '../../utils/logger.js';

const provider = process.env.LLM_PROVIDER || 'groq';

export class LLMAdapter {
  constructor() {
    this.provider = provider;
  }

  async call(systemPrompt, userMessage, temperature = 0.7) {
    try {
      if (this.provider === 'groq') {
        return await this.callGroq(systemPrompt, userMessage, temperature);
      } else if (this.provider === 'claude') {
        return await this.callClaude(systemPrompt, userMessage, temperature);
      }
      throw new Error(`Unsupported LLM provider: ${this.provider}`);
    } catch (error) {
      logger.error('LLM call failed', { error: error.message, provider: this.provider });
      throw error;
    }
  }

  async callGroq(systemPrompt, userMessage, temperature) {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    });

    return completion.choices[0].message.content;
  }

  async callClaude(systemPrompt, userMessage, temperature) {
    const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default);
    const client = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    return message.content[0].text;
  }
}

export const llm = new LLMAdapter();
