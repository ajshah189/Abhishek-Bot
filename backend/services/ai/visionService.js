import { config } from 'dotenv';
config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../utils/logger.js';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class VisionService {
  async analyzeImage(base64Image, mimeType = 'image/jpeg') {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
      const result = await model.generateContent([
        { inlineData: { data: base64Image, mimeType } },
        { text: `Analyze this image. If it's a receipt or bill, extract:
- is_receipt: true/false
- amount: total amount (number only)
- merchant: store/restaurant name
- category: food/travel/shopping/education/health/other
- items: brief list of items

If it's NOT a receipt, describe what you see briefly.

Respond ONLY with JSON:
{"is_receipt": false, "amount": 0, "merchant": "", "category": "", "items": "", "description": ""}` }
      ]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return { is_receipt: false, description: text };
    } catch (error) {
      logger.error('Vision analysis failed', { error: error.message });
      return { is_receipt: false, description: 'Could not analyze image.' };
    }
  }
}

export const visionService = new VisionService();
