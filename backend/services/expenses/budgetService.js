import { config } from 'dotenv';
config();

import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { expenseService } from './expenseService.js';

const DEFAULT_BUDGETS = {
  food: 8000,
  travel: 5000,
  shopping: 5000,
  education: 3000,
  health: 3000,
  other: 3000
};

export class BudgetService {
  async getBudgets(userId) {
    try {
      const doc = await db.collection('settings').doc(`budgets_${userId}`).get();
      if (doc.exists) return { ...DEFAULT_BUDGETS, ...doc.data() };
      return DEFAULT_BUDGETS;
    } catch (error) {
      logger.error('Failed to fetch budgets', { error: error.message });
      return DEFAULT_BUDGETS;
    }
  }

  async setBudget(userId, category, amount) {
    try {
      await db.collection('settings').doc(`budgets_${userId}`).set(
        { [category]: amount },
        { merge: true }
      );
      logger.info('Budget set', { userId, category, amount });
      return true;
    } catch (error) {
      logger.error('Failed to set budget', { error: error.message });
      return false;
    }
  }

  async checkBudgetWarning(userId, category) {
    const [budgets, summary] = await Promise.all([
      this.getBudgets(userId),
      expenseService.getMonthlySummary(userId)
    ]);

    const spent = summary[category] || 0;
    const budget = budgets[category];
    if (!budget) return null;

    const ratio = spent / budget;
    if (ratio >= 1) {
      return `⚠️ You're over your ${category} budget: ₹${spent} of ₹${budget}.`;
    }
    if (ratio >= 0.8) {
      return `Heads up — ${category} is at ₹${spent} of ₹${budget} (${Math.round(ratio * 100)}%).`;
    }
    return null;
  }

  async getTrends(userId) {
    try {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const snap = await db
        .collection('expenses')
        .where('userId', '==', userId.toString())
        .where('date', '>=', lastMonthStart)
        .get();

      const thisMonth = {};
      const lastMonth = {};

      snap.docs.forEach(d => {
        const e = d.data();
        const when = e.date?.toDate ? e.date.toDate() : new Date(e.date);
        const bucket = when >= thisMonthStart ? thisMonth : lastMonth;
        const cat = e.category || 'other';
        bucket[cat] = (bucket[cat] || 0) + (e.amount || 0);
      });

      return { thisMonth, lastMonth };
    } catch (error) {
      logger.error('Failed to compute trends', { error: error.message });
      return { thisMonth: {}, lastMonth: {} };
    }
  }
}

export const budgetService = new BudgetService();
