import { llm } from '../ai/llmAdapter.js';
import { intentExtractor } from '../ai/intentExtractor.js';
import { logger } from '../../utils/logger.js';

export class VoiceTranscriber {
  async transcribeAndProcess(audioBuffer, mimeType = 'audio/ogg') {
    try {
      logger.info('Voice transcription requested', { mimeType });

      const transcript = 'Voice transcription requires Speech-to-Text integration';

      const intent = await intentExtractor.extract(transcript);

      return {
        transcript,
        intent: intent.intent,
        fields: intent.fields,
        confidence: intent.confidence
      };
    } catch (error) {
      logger.error('Failed to transcribe voice', { error: error.message });
      throw error;
    }
  }

  async extractTasksFromVoice(transcript) {
    try {
      const extraction = await llm.call(
        'Extract any tasks, reminders, or notes from this voice note.',
        `Voice transcript: "${transcript}"`,
        0.5
      );

      return extraction;
    } catch (error) {
      logger.error('Failed to extract tasks from voice', { error: error.message });
      throw error;
    }
  }
}

export const voiceTranscriber = new VoiceTranscriber();
