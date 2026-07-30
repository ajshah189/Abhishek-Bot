import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class ExpenseService {
  async create(userId, fields) {
    try {
      const expenseData = {
        id: uuidv4(),
        userId: userId.toString(),
        amount: parseFloat(fields.amount || 0),
        currency: 'INR',
        category: fields.category || 'others',
        merchant: fields.merchant || 'Unknown',
        description: fields.description || '',
        date: new Date(),
        paymentMethod: fields.paymentMethod || 'cash',
        createdAt: new Date()
      };

      await db.collection('expenses').doc(expenseData.id).set(expenseData);
      logger.info('Expense created', { userId, expenseId: expenseData.id, amount: expenseData.amount });

      return expenseData;
    } catch (error) {
      logger.error('Failed to create expense', { error: error.message });
      throw error;
    }
  }

  async getUserExpenses(userId, days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const snapshot = await db
        .collection('expenses')
        .where('userId', '==', userId.toString())
        .where('date', '>=', since)
        .orderBy('date', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch expenses', { error: error.message });
      return [];
    }
  }

  async getMonthlySummary(userId) {
    const expenses = await this.getUserExpenses(userId, 30);
    const summary = {};

    expenses.forEach(expense => {
      const category = expense.category || 'others';
      summary[category] = (summary[category] || 0) + expense.amount;
    });

    return summary;
  }

  async delete(expenseId) {
    try {
      await db.collection('expenses').doc(expenseId).delete();
      logger.info('Expense deleted', { expenseId });
      return true;
    } catch (error) {
      logger.error('Failed to delete expense', { error: error.message });
      throw error;
    }
  }

  async deleteByTimeRange(userId, from, to) {
    try {
      const snapshot = await db
        .collection('expenses')
        .where('userId', '==', userId.toString())
        .where('date', '>=', from)
        .where('date', '<=', to)
        .get();
      if (snapshot.empty) return 0;
      await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
      logger.info('Expenses deleted by time range', { userId, from, to, count: snapshot.size });
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to delete expenses by time range', { error: error.message });
      throw error;
    }
  }

  async deleteToday(userId) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return this.deleteByTimeRange(userId, start, end);
  }

  async deleteThisWeek(userId) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return this.deleteByTimeRange(userId, start, now);
  }

  async deleteThisMonth(userId) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.deleteByTimeRange(userId, start, now);
  }

  async deleteAll(userId) {
    try {
      const snapshot = await db
        .collection('expenses')
        .where('userId', '==', userId.toString())
        .get();
      if (snapshot.empty) return 0;
      await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
      logger.info('All expenses deleted', { userId, count: snapshot.size });
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to delete all expenses', { error: error.message });
      throw error;
    }
  }

  async deleteByKeyword(userId, keyword) {
    try {
      const snapshot = await db
        .collection('expenses')
        .where('userId', '==', userId.toString())
        .get();
      const kw = keyword.toLowerCase();
      const matches = snapshot.docs.filter(doc => {
        const d = doc.data();
        return (d.description || '').toLowerCase().includes(kw) ||
               (d.merchant || '').toLowerCase().includes(kw) ||
               (d.category || '').toLowerCase().includes(kw);
      });
      if (!matches.length) return 0;
      await Promise.all(matches.map(doc => doc.ref.delete()));
      logger.info('Expenses deleted by keyword', { userId, keyword, count: matches.length });
      return matches.length;
    } catch (error) {
      logger.error('Failed to delete expenses by keyword', { error: error.message });
      throw error;
    }
  }
}

export const expenseService = new ExpenseService();
