import { config } from 'dotenv';
config();

import { GoogleGenerativeAI } from '@google/generative-ai';
import groq from '../../config/groq.js';
import { logger } from '../../utils/logger.js';

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// ── In-memory daily call counter (resets at midnight) ─────────────────────────
let dailyCallCount = 0;
let lastResetDate  = new Date().getDate();

function resetIfNewDay() {
  const today = new Date().getDate();
  if (today !== lastResetDate) {
    dailyCallCount = 0;
    lastResetDate  = today;
  }
}

export function getTokenUsage() {
  resetIfNewDay();
  return { used: dailyCallCount, limit: 'unlimited (Gemini primary)' };
}

export function isTokenBudgetLow() {
  return false; // Gemini has 1,500 req/day — effectively unlimited for single-user use
}

export class LLMAdapter {
  async call(systemPrompt, userMessage, temperature = 0.7) {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  }
      ],
      temperature
    );
  }

  async chat(messages, temperature = 0.7) {
    const providers = [
      { name: 'gemini', fn: () => this.callGemini(messages, temperature) },
      { name: 'groq',   fn: () => this.callGroq(messages, temperature)   }
    ];

    for (const provider of providers) {
      try {
        const result = await provider.fn();
        resetIfNewDay();
        dailyCallCount += Math.ceil(result.length / 4); // rough token estimate
        logger.info('LLM_OK', { provider: provider.name });
        return result;
      } catch (error) {
        logger.warn(`${provider.name} failed, trying next`, { error: error.message });
        continue;
      }
    }

    return "I'm having trouble connecting right now. Try again in a moment.";
  }

  async callGemini(messages, temperature) {
    if (!gemini) throw new Error('Gemini not configured');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatMsgs  = messages.filter(m => m.role !== 'system');

    // Prepend system prompt as first user message — avoids systemInstruction
    // format variations across SDK versions (structured vs string both brittle).
    const augmented = chatMsgs.map((m, i) => (
      i === 0 && systemMsg
        ? { ...m, content: `${systemMsg}\n\n${m.content}` }
        : m
    ));

    const model = gemini.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature, maxOutputTokens: 1024 }
    });

    const history = augmented.slice(0, -1).map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const chat    = model.startChat({ history: this.cleanGeminiHistory(history) });
    const lastMsg = augmented[augmented.length - 1];
    const result  = await chat.sendMessage(lastMsg.content);
    return result.response.text();
  }

  cleanGeminiHistory(history) {
    if (!history.length) return [];

    const cleaned = [history[0]];
    for (let i = 1; i < history.length; i++) {
      if (history[i].role === cleaned[cleaned.length - 1].role) {
        // Merge consecutive same-role messages (Gemini requires alternating turns)
        cleaned[cleaned.length - 1].parts[0].text += '\n' + history[i].parts[0].text;
      } else {
        cleaned.push(history[i]);
      }
    }

    if (cleaned.length && cleaned[0].role === 'model') {
      cleaned.unshift({ role: 'user', parts: [{ text: '(continuing conversation)' }] });
    }

    return cleaned;
  }

  async callGroq(messages, temperature) {
    const completion = await groq.chat.completions.create({
      model:      'llama-3.3-70b-versatile',
      messages,
      temperature,
      max_tokens: 1024
    });
    return completion.choices[0]?.message?.content || '';
  }
}

export const llm = new LLMAdapter();
