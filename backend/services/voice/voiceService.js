import { logger } from '../../utils/logger.js';

export class VoiceService {
  async transcribeVoice(audioBuffer, mimeType = 'audio/ogg') {
    try {
      logger.info('Voice transcription requested', { mimeType });
      return 'Voice transcription pending implementation';
    } catch (error) {
      logger.error('Failed to transcribe voice', { error: error.message });
      throw error;
    }
  }

  async extractTasksFromVoice(transcript) {
    return transcript;
  }
}

export const voiceService = new VoiceService();
