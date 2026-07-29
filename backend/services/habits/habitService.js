import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { parseRecurrence } from '../ai/dateParser.js';

// How many hours past the interval counts as a missed day
const GRACE_HOURS = 6;

export class HabitService {
  async create(userId, fields) {
    try {
      const recurrence = parseRecurrence(fields.recurrence_text || fields.frequency || 'daily');
      const habitData = {
        id: uuidv4(),
        userId: userId.toString(),
        name: fields.title || fields.name || 'New Habit',
        description: fields.description || '',
        frequency: recurrence?.rule || 'daily',
        intervalDays: recurrence?.intervalDays || 1,
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
      const doc = await db.collection('habits').doc(habitId).get();
      if (!doc.exists) throw new Error('Habit not found');

      const habit = doc.data();
      const now = new Date();
      const intervalMs = (habit.intervalDays || 1) * 24 * 60 * 60 * 1000;
      const graceMs = GRACE_HOURS * 60 * 60 * 1000;

      let newStreak = 1;
      if (habit.lastCompleted) {
        const last = habit.lastCompleted.toDate ? habit.lastCompleted.toDate() : new Date(habit.lastCompleted);
        const gapMs = now - last;
        // Completed within the interval + grace window → increment streak
        if (gapMs <= intervalMs + graceMs) {
          newStreak = (habit.streak || 0) + 1;
        }
        // else missed a cycle → reset to 1
      }

      await db.collection('habits').doc(habitId).update({
        streak: newStreak,
        lastCompleted: now
      });

      logger.info('Habit completed', { habitId, newStreak });
      return newStreak;
    } catch (error) {
      logger.error('Failed to mark habit complete', { error: error.message });
      throw error;
    }
  }

  // Keyword-match a habit from a user's list, same approach as matchTask
  matchHabit(habits, matchText) {
    if (!matchText || !habits.length) return null;
    const words = matchText.toLowerCase().split(/\s+/);
    let best = null;
    let bestScore = 0;
    for (const h of habits) {
      const name = (h.name || '').toLowerCase();
      const score = words.filter(w => w.length > 2 && name.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return bestScore > 0 ? best : null;
  }
}

export const habitService = new HabitService();
