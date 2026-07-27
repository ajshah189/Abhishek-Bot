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
}

export const expenseService = new ExpenseService();
