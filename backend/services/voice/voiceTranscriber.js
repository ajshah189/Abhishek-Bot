import { config } from 'dotenv';
config();

import axios from 'axios';
import FormData from 'form-data';
import { getTelegramApiUrl, telegramConfig } from '../../config/telegram.js';
import { logger } from '../../utils/logger.js';

export class VoiceTranscriber {
  async transcribeTelegramVoice(fileId) {
    try {
      // 1. Get the file path from Telegram
      const fileRes = await axios.get(getTelegramApiUrl('getFile'), {
        params: { file_id: fileId }
      });
      const filePath = fileRes.data.result.file_path;

      // 2. Download the actual audio bytes
      const downloadUrl = `https://api.telegram.org/file/bot${telegramConfig.botToken}/${filePath}`;
      const audioRes = await axios.get(downloadUrl, { responseType: 'arraybuffer' });

      // 3. Send to Groq Whisper via raw HTTP (most reliable in Node)
      const form = new FormData();
      form.append('file', Buffer.from(audioRes.data), { filename: 'voice.ogg' });
      form.append('model', 'whisper-large-v3-turbo');

      const raw = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`
          }
        }
      );

      const text = raw.data?.text?.trim();
      logger.info('Voice transcribed', { length: text?.length || 0 });
      return text || null;
    } catch (error) {
      logger.error('Voice transcription failed', { error: error.message });
      return null;
    }
  }
}

export const voiceTranscriber = new VoiceTranscriber();
