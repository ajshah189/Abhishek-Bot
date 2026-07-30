import axios from 'axios';
import { createRequire } from 'module';
import { db } from '../../config/firebase.js';
import { llm } from '../ai/llmAdapter.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// pdf-parse is CJS; use createRequire to avoid ESM test-file side-effect bug
const require = createRequire(import.meta.url);

const MAX_LLM_CHARS = 30000;
const MAX_CONTEXT_CHARS = 5000;
const ACTIVE_DOC_TTL_MS = 10 * 60 * 1000;

function telegramFileUrl(filePath) {
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
}

async function downloadFromTelegram(fileId) {
  const apiBase = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  const fileRes = await axios.get(`${apiBase}/getFile`, { params: { file_id: fileId } });
  const filePath = fileRes.data.result.file_path;
  const res = await axios.get(telegramFileUrl(filePath), { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

export class PDFService {
  async processUpload(userId, fileId, filename) {
    // Download bytes from Telegram
    const buffer = await downloadFromTelegram(fileId);

    // Extract text
    let rawText = '';
    try {
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      rawText = data.text || '';
    } catch (err) {
      logger.error('pdf-parse failed', { userId, error: err.message });
      return { error: 'parse_failed', message: "Couldn't read that PDF — try a text-based one (scanned PDFs aren't supported yet)." };
    }

    const text = rawText.trim().slice(0, MAX_LLM_CHARS);
    if (!text) {
      return { error: 'empty', message: "Couldn't read that PDF — try a text-based one (scanned PDFs aren't supported yet)." };
    }

    // Summarize
    const summary = await llm.call(
      'Summarize this document concisely in 3-5 key points. Be specific — include names, numbers, and dates if present.',
      text,
      0.4
    );

    // Persist
    const docId = uuidv4();
    await db.collection('documents').doc(docId).set({
      docId,
      userId: userId.toString(),
      filename: filename || 'document.pdf',
      text,
      summary,
      createdAt: new Date()
    });

    // Mark as active doc for Q&A
    await this.setActiveDoc(userId, docId, text, summary);

    logger.info('PDF processed', { userId, docId, textLen: text.length });
    return { docId, summary, filename: filename || 'document.pdf' };
  }

  async setActiveDoc(userId, docId, text, summary) {
    await db.collection('settings').doc(`active_doc_${userId}`).set({
      docId,
      text: text.slice(0, MAX_CONTEXT_CHARS),
      summary,
      expiresAt: new Date(Date.now() + ACTIVE_DOC_TTL_MS)
    });
  }

  async getActiveDoc(userId) {
    try {
      const doc = await db.collection('settings').doc(`active_doc_${userId}`).get();
      if (!doc.exists) return null;
      const data = doc.data();
      const expires = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (expires < new Date()) {
        await this.clearActiveDoc(userId);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  async touchActiveDoc(userId) {
    try {
      await db.collection('settings').doc(`active_doc_${userId}`).update({
        expiresAt: new Date(Date.now() + ACTIVE_DOC_TTL_MS)
      });
    } catch {}
  }

  async clearActiveDoc(userId) {
    try {
      await db.collection('settings').doc(`active_doc_${userId}`).delete();
    } catch {}
  }
}

export const pdfService = new PDFService();
