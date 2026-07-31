import { config } from 'dotenv';
config();
import { db } from '../../config/firebase.js';
import { llm } from '../ai/llmAdapter.js';
import { logger } from '../../utils/logger.js';

export class DailySummarizer {
  async summarizeDay(userId) {
    const uid = userId.toString();
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const snap = await db.collection('conversation_logs')
      .where('userId', '==', uid)
      .where('timestamp', '>=', startOfDay)
      .orderBy('timestamp', 'asc')
      .get();

    if (snap.docs.length < 3) return null;

    const convo = snap.docs.map(d => {
      const data = d.data();
      return `User: ${data.userMessage}\nBot: ${data.botReply}`;
    }).join('\n\n');

    const summary = await llm.call(
      'You are a concise summarizer. Summarize in 2-3 sentences focusing on: decisions made, tasks created, expenses logged, information shared, preferences expressed. Be factual, not generic.',
      `Today\'s conversation:\n\n${convo}`
    );

    await db.collection('daily_summaries').doc(`${uid}_${dateStr}`).set({
      userId: uid,
      date: dateStr,
      summary,
      createdAt: new Date()
    });

    logger.info('Day summarized', { userId: uid, date: dateStr });
    return summary;
  }

  async getRecentSummaries(userId, days = 7) {
    const uid = userId.toString();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    try {
      const snap = await db.collection('daily_summaries')
        .where('userId', '==', uid)
        .where('date', '>=', sinceStr)
        .orderBy('date', 'desc')
        .get();

      return snap.docs.map(d => ({ date: d.data().date, summary: d.data().summary }));
    } catch (err) {
      logger.warn('getRecentSummaries failed', { error: err.message });
      return [];
    }
  }
}

export const dailySummarizer = new DailySummarizer();
