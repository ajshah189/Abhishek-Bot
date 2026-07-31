import { config } from 'dotenv';
config();
import { db } from '../../config/firebase.js';
import { llm } from '../ai/llmAdapter.js';
import { memoryService } from '../memory/memoryService.js';
import { logger } from '../../utils/logger.js';

export class PatternAnalyzer {
  async analyzePatterns(userId) {
    const uid = userId.toString();
    const since = new Date();
    since.setDate(since.getDate() - 14);

    // Fetch 14 days of data in parallel
    const [tasksSnap, expensesSnap, habitsSnap] = await Promise.all([
      db.collection('tasks').where('userId', '==', uid).where('createdAt', '>=', since).get(),
      db.collection('expenses').where('userId', '==', uid).where('createdAt', '>=', since).get(),
      db.collection('habits').where('userId', '==', uid).get()
    ]);

    const tasks = tasksSnap.docs.map(d => {
      const data = d.data();
      return { title: data.title, status: data.status, createdAt: data.createdAt?.toDate?.()?.toISOString?.()?.slice(0,10), deadline: data.deadline?.toDate?.()?.toISOString?.()?.slice(0,10) };
    });
    const expenses = expensesSnap.docs.map(d => {
      const data = d.data();
      return { amount: data.amount, category: data.category, date: data.createdAt?.toDate?.()?.toISOString?.()?.slice(0,10) };
    });
    const habits = habitsSnap.docs.map(d => {
      const data = d.data();
      return { name: data.name, streak: data.streak, frequency: data.frequency, lastCompleted: data.lastCompleted?.toDate?.()?.toISOString?.()?.slice(0,10) };
    });

    if (tasks.length + expenses.length === 0) return null;

    const dataStr = JSON.stringify({ tasks, expenses, habits }, null, 2);
    const response = await llm.call(
      'You analyze user behavior data and identify patterns. Respond ONLY with valid JSON.',
      `Analyze this 2-week behavior data and identify 3-5 patterns. Focus on: when most/least productive, spending patterns, habit consistency, task completion patterns.

Data:
${dataStr}

Respond ONLY with JSON:
{"patterns": [{"observation": "...", "type": "habit|spending|productivity|task", "actionable": "..."}]}`
    );

    let patterns;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      patterns = jsonMatch ? JSON.parse(jsonMatch[0]).patterns : [];
    } catch {
      logger.warn('Pattern parsing failed', { response });
      return null;
    }

    if (!patterns || !patterns.length) return null;

    // Delete old patterns for this user
    const oldSnap = await db.collection('memories')
      .where('userId', '==', uid)
      .where('category', '==', 'pattern')
      .get();
    await Promise.all(oldSnap.docs.map(d => d.ref.delete()));

    // Store new patterns as memories using correct memoryService.store signature
    for (const p of patterns) {
      await memoryService.store(uid, {
        key: `pattern_${p.type}`,
        value: `${p.observation}. ${p.actionable}`,
        category: 'pattern'
      });
    }

    logger.info('Patterns analyzed', { userId: uid, count: patterns.length });
    return patterns;
  }
}

export const patternAnalyzer = new PatternAnalyzer();
