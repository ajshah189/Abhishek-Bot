import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const WIN_PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class WinsService {
  async storeWin(userId, text) {
    const id = uuidv4();
    const data = {
      id,
      userId: userId.toString(),
      type: 'win',
      content: text,
      title: text.slice(0, 80),
      createdAt: new Date()
    };
    await db.collection('journal').doc(id).set(data);
    logger.info('Win stored', { userId, id });
    return data;
  }

  async getWins(userId, days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const snap = await db.collection('journal')
        .where('userId', '==', userId.toString())
        .where('type', '==', 'win')
        .where('createdAt', '>=', from)
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map(d => d.data());
    } catch (err) {
      logger.error('getWins failed', { error: err.message });
      return [];
    }
  }

  async getWeeklyWinCount(userId) {
    const wins = await this.getWins(userId, 7);
    return wins.length;
  }

  async setWinPending(userId) {
    await db.collection('settings').doc(`win_pending_${userId}`).set({
      until: Date.now() + WIN_PENDING_TTL_MS
    });
  }

  async getWinPending(userId) {
    try {
      const doc = await db.collection('settings').doc(`win_pending_${userId}`).get();
      if (!doc.exists) return false;
      const { until } = doc.data();
      if (Date.now() > until) {
        await doc.ref.delete().catch(() => {});
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async clearWinPending(userId) {
    await db.collection('settings').doc(`win_pending_${userId}`).delete().catch(() => {});
  }

  formatWinsTimeline(wins) {
    if (!wins.length) return 'No wins logged yet. Share what you\'re proud of each evening — I\'ll track them here.';
    const grouped = {};
    wins.forEach(w => {
      const d = w.createdAt?.toDate ? w.createdAt.toDate() : new Date(w.createdAt || 0);
      const key = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(w.content || w.title);
    });
    return Object.entries(grouped)
      .map(([date, items]) => `📅 *${date}*\n${items.map(i => `  🏆 ${i}`).join('\n')}`)
      .join('\n\n');
  }
}

export const winsService = new WinsService();
