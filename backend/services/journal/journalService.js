import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class JournalService {
  async create(userId, fields) {
    try {
      const entryData = {
        id: uuidv4(),
        userId: userId.toString(),
        title: fields.title || `Journal Entry - ${new Date().toDateString()}`,
        content: fields.description || fields.content || '',
        mood: fields.mood || 'neutral',
        tags: fields.tags || [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('journal').doc(entryData.id).set(entryData);
      logger.info('Journal entry created', { userId, entryId: entryData.id });

      return entryData;
    } catch (error) {
      logger.error('Failed to create journal entry', { error: error.message });
      throw error;
    }
  }

  async getUserEntries(userId, days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const snapshot = await db
        .collection('journal')
        .where('userId', '==', userId.toString())
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch journal entries', { error: error.message });
      return [];
    }
  }

  async getWeeklySummary(userId) {
    const entries = await this.getUserEntries(userId, 7);
    const moods = {};

    entries.forEach(entry => {
      const mood = entry.mood || 'neutral';
      moods[mood] = (moods[mood] || 0) + 1;
    });

    return {
      entriesCount: entries.length,
      moods,
      entries: entries.slice(0, 7)
    };
  }

  async delete(entryId) {
    try {
      await db.collection('journal').doc(entryId).delete();
      logger.info('Journal entry deleted', { entryId });
      return true;
    } catch (error) {
      logger.error('Failed to delete journal entry', { error: error.message });
      throw error;
    }
  }
}

export const journalService = new JournalService();
