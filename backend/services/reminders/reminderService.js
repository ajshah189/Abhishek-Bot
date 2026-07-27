import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class ReminderService {
  async create(userId, fields) {
    try {
      const reminderData = {
        id: uuidv4(),
        userId: userId.toString(),
        title: fields.title || 'Reminder',
        description: fields.description || '',
        reminderTime: new Date(fields.date || Date.now()),
        type: fields.type || 'custom',
        recurring: false,
        recurrenceRule: null,
        status: 'pending',
        createdAt: new Date()
      };

      await db.collection('reminders').doc(reminderData.id).set(reminderData);
      logger.info('Reminder created', { userId, reminderId: reminderData.id });

      return reminderData;
    } catch (error) {
      logger.error('Failed to create reminder', { error: error.message });
      throw error;
    }
  }

  async getPendingReminders(userId) {
    try {
      const now = new Date();
      const snapshot = await db
        .collection('reminders')
        .where('userId', '==', userId.toString())
        .where('status', '==', 'pending')
        .where('reminderTime', '<=', now)
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch reminders', { error: error.message });
      return [];
    }
  }

  async markAsSent(reminderId) {
    try {
      await db.collection('reminders').doc(reminderId).update({
        status: 'sent'
      });
      logger.info('Reminder marked as sent', { reminderId });
      return true;
    } catch (error) {
      logger.error('Failed to update reminder', { error: error.message });
      throw error;
    }
  }

  async delete(reminderId) {
    try {
      await db.collection('reminders').doc(reminderId).delete();
      logger.info('Reminder deleted', { reminderId });
      return true;
    } catch (error) {
      logger.error('Failed to delete reminder', { error: error.message });
      throw error;
    }
  }
}

export const reminderService = new ReminderService();
