import axios from 'axios';
import groq from '../../config/groq.js';
import { logger } from '../../utils/logger.js';

const VISION_MODEL = 'llama-3.2-90b-vision-preview';

const RECEIPT_SYSTEM = `You are an expense receipt analyzer. Look at this image and respond ONLY with a JSON object — no other text:
{"is_receipt":true,"amount":0,"merchant":"","category":"food|travel|shopping|education|health|other","date":"","items":"","description":""}
If it is NOT a receipt, set is_receipt to false and fill description with a brief one-sentence description of the image.`;

async function downloadFromTelegram(fileId) {
  const apiBase = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  const fileRes = await axios.get(`${apiBase}/getFile`, { params: { file_id: fileId } });
  const filePath = fileRes.data.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const res = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
  return Buffer.from(res.data).toString('base64');
}

export class VisionService {
  async processPhoto(userId, fileId) {
    try {
      const base64 = await downloadFromTelegram(fileId);

      const completion = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
            { type: 'text', text: RECEIPT_SYSTEM }
          ]
        }],
        temperature: 0.1,
        max_tokens: 512
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { is_receipt: false, description: raw.trim() };
      return JSON.parse(match[0]);
    } catch (error) {
      logger.error('Vision analysis failed', { userId, error: error.message });
      return null;
    }
  }
}

export const visionService = new VisionService();
