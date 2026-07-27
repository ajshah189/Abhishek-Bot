import { llm } from '../ai/llmAdapter.js';
import { logger } from '../../utils/logger.js';

export class PDFExtractor {
  async extractText(pdfUrl) {
    try {
      logger.info('PDF text extraction requested', { pdfUrl });
      return 'PDF text extraction requires pdfjs-dist integration';
    } catch (error) {
      logger.error('Failed to extract PDF text', { error: error.message });
      throw error;
    }
  }

  async summarizePDF(pdfUrl, pdfText) {
    try {
      const summary = await llm.call(
        'You are an expert at summarizing documents. Provide a concise summary of the PDF content.',
        `Summarize this PDF content:\n\n${pdfText}`,
        0.7
      );

      logger.info('PDF summarized', { pdfUrl });
      return summary;
    } catch (error) {
      logger.error('Failed to summarize PDF', { error: error.message });
      throw error;
    }
  }

  async answerPDFQuestion(pdfText, question) {
    try {
      const answer = await llm.call(
        'You are an assistant that answers questions about documents. Answer based on the provided text.',
        `Document content:\n${pdfText}\n\nQuestion: ${question}`,
        0.7
      );

      logger.info('PDF question answered', { questionLength: question.length });
      return answer;
    } catch (error) {
      logger.error('Failed to answer PDF question', { error: error.message });
      throw error;
    }
  }
}

export const pdfExtractor = new PDFExtractor();
