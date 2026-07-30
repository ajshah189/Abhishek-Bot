import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { parseRecurrence } from '../ai/dateParser.js';

const GRACE_HOURS = 6;

export class HabitService {
  async create(userId, fields) {
    try {
      const recurrence = parseRecurrence(fields.recurrence_text || fields.frequency || 'daily');
      const name = (fields.title || fields.name || 'New Habit').trim();
      const nameLower = name.toLowerCase();

      // Dedup: check for existing habit with same normalized name
      const existing = await db
        .collection('habits')
        .where('userId', '==', userId.toString())
        .get();

      const duplicate = existing.docs.find(
        d => (d.data().name || '').trim().toLowerCase() === nameLower
      );

      if (duplicate) {
        // Update recurrence on the existing habit rather than creating a second one
        const updates = {
          frequency: recurrence?.rule || 'daily',
          intervalDays: recurrence?.intervalDays || 1,
          updatedAt: new Date()
        };
        await db.collection('habits').doc(duplicate.id).update(updates);
        logger.info('Habit updated (dedup)', { userId, habitId: duplicate.id, name });
        return { ...duplicate.data(), ...updates };
      }

      const habitData = {
        id: uuidv4(),
        userId: userId.toString(),
        name,
        description: fields.description || '',
        frequency: recurrence?.rule || 'daily',
        intervalDays: recurrence?.intervalDays || 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        streak: 0,
        lastCompleted: null
      };

      await db.collection('habits').doc(habitData.id).set(habitData);
      logger.info('Habit created', { userId, habitId: habitData.id, name });
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

      return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }));
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
        if (gapMs <= intervalMs + graceMs) {
          newStreak = (habit.streak || 0) + 1;
        }
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

  async delete(habitId) {
    try {
      await db.collection('habits').doc(habitId).delete();
      logger.info('Habit deleted', { habitId });
      return true;
    } catch (error) {
      logger.error('Failed to delete habit', { error: error.message });
      throw error;
    }
  }

  // Removes duplicates for a user, keeping the entry with the highest streak.
  async deduplicateForUser(userId) {
    try {
      const snapshot = await db
        .collection('habits')
        .where('userId', '==', userId.toString())
        .get();

      const byName = {};
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const key = (data.name || '').trim().toLowerCase();
        if (!byName[key]) byName[key] = [];
        byName[key].push({ id: doc.id, streak: data.streak || 0 });
      }

      let deleted = 0;
      for (const entries of Object.values(byName)) {
        if (entries.length <= 1) continue;
        // Keep highest streak, delete the rest
        entries.sort((a, b) => b.streak - a.streak);
        for (const entry of entries.slice(1)) {
          await db.collection('habits').doc(entry.id).delete();
          deleted++;
        }
      }

      logger.info('Dedup complete', { userId, deleted });
      return deleted;
    } catch (error) {
      logger.error('Failed to dedup habits', { error: error.message });
      return 0;
    }
  }

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
