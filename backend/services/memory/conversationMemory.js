import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

export class ConversationMemory {
  constructor(maxTurns = 10) {
    this.maxTurns = maxTurns;
  }

  async addTurn(userId, role, content) {
    try {
      await db.collection('conversation_logs').add({
        userId: userId.toString(),
        role,
        content,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to add conversation turn', { error: error.message });
    }
  }

  async getRecentTurns(userId) {
    try {
      const snapshot = await db
        .collection('conversation_logs')
        .where('userId', '==', userId.toString())
        .orderBy('timestamp', 'desc')
        .limit(this.maxTurns)
        .get();

      const turns = snapshot.docs
        .map(doc => doc.data())
        .filter(t => t.role && t.content)
        .reverse();

      return turns.map(t => ({ role: t.role, content: t.content }));
    } catch (error) {
      logger.error('Failed to fetch conversation turns', { error: error.message });
      return [];
    }
  }
}

export const conversationMemory = new ConversationMemory(10);
