import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class HabitService {
  async create(userId, fields) {
    try {
      const habitData = {
        id: uuidv4(),
        userId: userId.toString(),
        name: fields.title || 'New Habit',
        description: fields.description || '',
        frequency: fields.frequency || 'daily',
        createdAt: new Date(),
        streak: 0,
        lastCompleted: null
      };

      await db.collection('habits').doc(habitData.id).set(habitData);
      logger.info('Habit created', { userId, habitId: habitData.id });

      return habitData;
    } catch (error) {
      logger.error('Failed to create habit', { error: error.message });
      throw error;
    }
  }

  async getUserHabits(userId) {
    try {
      const snapshot = await db
        .collection('habits')
        .where('userId', '==', userId.toString())
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch habits', { error: error.message });
      return [];
    }
  }

  async markComplete(habitId) {
    try {
      const admin = await import('firebase-admin').then(m => m.default);
      await db.collection('habits').doc(habitId).update({
        lastCompleted: new Date(),
        streak: admin.firestore.FieldValue.increment(1)
      });

      logger.info('Habit completed', { habitId });
      return true;
    } catch (error) {
      logger.error('Failed to mark habit complete', { error: error.message });
      throw error;
    }
  }
}

export const habitService = new HabitService();
