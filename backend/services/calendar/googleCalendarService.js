import { google } from 'googleapis';
import { getAuthenticatedClient } from './googleAuth.js';
import { logger } from '../../utils/logger.js';

const NOT_CONNECTED = { error: 'not_connected', message: 'Calendar not connected. Run /connectcalendar to link your Google Calendar.' };

export class GoogleCalendarService {
  async createEvent(userId, { title, startTime, endTime, description = '', location = '' }) {
    try {
      const auth = await getAuthenticatedClient(userId);
      if (!auth) return NOT_CONNECTED;

      const calendar = google.calendar({ version: 'v3', auth });
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000);

      const event = {
        summary: title,
        description,
        location,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' }
      };

      const res = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
      logger.info('Calendar event created', { userId, eventId: res.data.id });
      return { success: true, link: res.data.htmlLink, eventId: res.data.id };
    } catch (error) {
      logger.error('Failed to create calendar event', { userId, error: error.message });
      return { error: error.message };
    }
  }

  async listUpcomingEvents(userId, maxResults = 10) {
    try {
      const auth = await getAuthenticatedClient(userId);
      if (!auth) return NOT_CONNECTED;

      const calendar = google.calendar({ version: 'v3', auth });
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'Asia/Kolkata'
      });

      return (res.data.items || []).map(e => ({
        id: e.id,
        title: e.summary || '(no title)',
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        location: e.location || ''
      }));
    } catch (error) {
      logger.error('Failed to list upcoming events', { userId, error: error.message });
      return { error: error.message };
    }
  }

  async listTodayEvents(userId) {
    try {
      const auth = await getAuthenticatedClient(userId);
      if (!auth) return NOT_CONNECTED;

      const calendar = google.calendar({ version: 'v3', auth });
      // Compute today's boundaries in IST (server runs UTC on Cloud Run)
      const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
      const istNow = new Date(Date.now() + IST_OFFSET_MS);
      const startOfDay = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        timeZone: 'Asia/Kolkata',
        singleEvents: true,
        orderBy: 'startTime'
      });

      return (res.data.items || []).map(e => ({
        id: e.id,
        title: e.summary || '(no title)',
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        location: e.location || ''
      }));
    } catch (error) {
      logger.error('Failed to list today events', { userId, error: error.message });
      return { error: error.message };
    }
  }

  async deleteEvent(userId, eventId) {
    try {
      const auth = await getAuthenticatedClient(userId);
      if (!auth) return NOT_CONNECTED;

      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({ calendarId: 'primary', eventId });
      logger.info('Calendar event deleted', { userId, eventId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete calendar event', { userId, error: error.message });
      return { error: error.message };
    }
  }

  async findEvent(userId, searchText) {
    try {
      const auth = await getAuthenticatedClient(userId);
      if (!auth) return NOT_CONNECTED;

      const calendar = google.calendar({ version: 'v3', auth });
      const res = await calendar.events.list({
        calendarId: 'primary',
        q: searchText,
        timeMin: new Date().toISOString(),
        maxResults: 5,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return (res.data.items || []).map(e => ({
        id: e.id,
        title: e.summary || '(no title)',
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        location: e.location || ''
      }));
    } catch (error) {
      logger.error('Failed to find event', { userId, error: error.message });
      return { error: error.message };
    }
  }

  formatEvents(events) {
    if (events?.error === 'not_connected') return events.message;
    if (events?.error) return `❌ Calendar error: ${events.error}`;
    if (!events.length) return 'No events found.';

    return events.map(e => {
      const start = new Date(e.start);
      const time = isNaN(start)
        ? e.start
        : start.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      return `📅 *${e.title}*\n   ${time}${e.location ? `\n   📍 ${e.location}` : ''}`;
    }).join('\n\n');
  }
}

export const googleCalendarService = new GoogleCalendarService();
