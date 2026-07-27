import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class CalendarService {
  async create(userId, fields) {
    try {
      const eventData = {
        id: uuidv4(),
        userId: userId.toString(),
        title: fields.title || 'Event',
        description: fields.description || '',
        startTime: new Date(fields.date || Date.now()),
        endTime: fields.endTime ? new Date(fields.endTime) : null,
        location: fields.location || '',
        type: fields.type || 'meeting',
        recurring: false,
        recurrenceRule: null,
        createdAt: new Date()
      };

      await db.collection('calendar').doc(eventData.id).set(eventData);
      logger.info('Calendar event created', { userId, eventId: eventData.id });

      return eventData;
    } catch (error) {
      logger.error('Failed to create calendar event', { error: error.message });
      throw error;
    }
  }

  async getUserEvents(userId, from, to) {
    try {
      const snapshot = await db
        .collection('calendar')
        .where('userId', '==', userId.toString())
        .where('startTime', '>=', from)
        .where('startTime', '<=', to)
        .orderBy('startTime', 'asc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch calendar events', { error: error.message });
      return [];
    }
  }

  async getTodayEvents(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getUserEvents(userId, today, tomorrow);
  }

  async delete(eventId) {
    try {
      await db.collection('calendar').doc(eventId).delete();
      logger.info('Calendar event deleted', { eventId });
      return true;
    } catch (error) {
      logger.error('Failed to delete calendar event', { error: error.message });
      throw error;
    }
  }
}

export const calendarService = new CalendarService();
