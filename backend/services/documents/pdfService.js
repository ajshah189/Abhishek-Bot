import { storage } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class PDFService {
  async uploadPDF(userId, fileBuffer, filename) {
    try {
      const fileId = uuidv4();
      const bucket = storage.bucket();
      const file = bucket.file(`pdfs/${userId}/${fileId}-${filename}`);

      await file.save(fileBuffer);
      await file.makePublic();

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/pdfs/${userId}/${fileId}-${filename}`;

      logger.info('PDF uploaded', { userId, fileId, filename });

      return {
        fileId,
        filename,
        url: publicUrl,
        uploadedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to upload PDF', { error: error.message });
      throw error;
    }
  }

  async deletePDF(userId, fileId) {
    try {
      const bucket = storage.bucket();
      const [files] = await bucket.getFiles({ prefix: `pdfs/${userId}/${fileId}` });

      for (const file of files) {
        await file.delete();
      }

      logger.info('PDF deleted', { userId, fileId });
      return true;
    } catch (error) {
      logger.error('Failed to delete PDF', { error: error.message });
      throw error;
    }
  }

  async summarizePDF(content) {
    return `PDF Summary: ${content.slice(0, 200)}...`;
  }
}

export const pdfService = new PDFService();
