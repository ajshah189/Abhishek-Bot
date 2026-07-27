import { llm } from './llmAdapter.js';
import { logger } from '../../utils/logger.js';
import { enhancedIntentPrompt } from '../../prompts/enhancedIntents.js';

export class IntentExtractor {
  async extract(userMessage) {
    try {
      const response = await llm.call(
        enhancedIntentPrompt.system,
        `Extract intent from: "${userMessage}"`,
        0.2
      );

      const parsed = this.parseResponse(response);
      logger.info('Intent extracted', {
        message: userMessage.slice(0, 50),
        intent: parsed.intent,
        confidence: parsed.confidence
      });

      return {
        intent: parsed.intent,
        fields: parsed.fields || {},
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      logger.error('Intent extraction failed', { error: error.message });
      return {
        intent: 'conversation',
        fields: {},
        confidence: 0.3,
        reasoning: 'Fallback due to error'
      };
    }
  }

  parseResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'conversation',
          fields: parsed.fields || {},
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || ''
        };
      }
    } catch (e) {
      logger.debug('Failed to parse intent response', { response: response.slice(0, 100) });
    }

    // Fallback keyword-based detection
    const lower = response.toLowerCase();

    if (lower.includes('task') || lower.includes('todo')) {
      return { intent: 'task', fields: {}, confidence: 0.4 };
    }
    if (lower.includes('expense') || lower.includes('spent')) {
      return { intent: 'expense', fields: {}, confidence: 0.4 };
    }
    if (lower.includes('remind')) {
      return { intent: 'reminder', fields: {}, confidence: 0.4 };
    }
    if (lower.includes('remember')) {
      return { intent: 'memory', fields: {}, confidence: 0.4 };
    }

    return { intent: 'conversation', fields: {}, confidence: 0.3 };
  }
}

export const intentExtractor = new IntentExtractor();
