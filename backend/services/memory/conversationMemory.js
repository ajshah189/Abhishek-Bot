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

  async clearHistory(userId) {
    try {
      let deleted = 0;
      let snapshot;
      do {
        snapshot = await db
          .collection('conversation_logs')
          .where('userId', '==', userId.toString())
          .limit(500)
          .get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snapshot.docs.length;
      } while (!snapshot.empty);
      logger.info('Conversation history cleared', { userId, deleted });
    } catch (error) {
      logger.error('Failed to clear conversation history', { error: error.message });
    }
  }
}

export const conversationMemory = new ConversationMemory(10);
