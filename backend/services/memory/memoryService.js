import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class MemoryService {
  async store(userId, fields) {
    try {
      const memoryData = {
        id: uuidv4(),
        userId: userId.toString(),
        category: fields.category || 'general',
        key: fields.key || '',
        value: fields.value || fields.description || '',
        context: fields.context || '',
        frequency: fields.frequency || 'once',
        always: fields.always === true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('memories').doc(memoryData.id).set(memoryData);
      logger.info('Memory stored', { userId, memoryId: memoryData.id, category: memoryData.category });

      return memoryData;
    } catch (error) {
      logger.error('Failed to store memory', { error: error.message });
      throw error;
    }
  }

  async getUserMemories(userId, category = null) {
    try {
      let query = db.collection('memories').where('userId', '==', userId.toString());

      if (category) {
        query = query.where('category', '==', category);
      }

      const snapshot = await query.orderBy('updatedAt', 'desc').get();
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch memories', { error: error.message });
      return [];
    }
  }

  async search(userId, query) {
    const memories = await this.getUserMemories(userId);
    const queryLower = query.toLowerCase();

    return memories.filter(memory =>
      memory.key.toLowerCase().includes(queryLower) ||
      memory.value.toLowerCase().includes(queryLower)
    );
  }

  async delete(memoryId) {
    try {
      await db.collection('memories').doc(memoryId).delete();
      logger.info('Memory deleted', { memoryId });
      return true;
    } catch (error) {
      logger.error('Failed to delete memory', { error: error.message });
      throw error;
    }
  }
}

export const memoryService = new MemoryService();
