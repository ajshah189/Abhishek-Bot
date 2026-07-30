import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { parseRecurrence, computeNextDue } from '../ai/dateParser.js';

export class TaskService {
  async create(userId, fields) {
    try {
      const recurrence = parseRecurrence(fields.recurrence_text || '');
      const deadline = fields.date ? new Date(fields.date) : (fields.deadline ? new Date(fields.deadline) : null);

      const taskData = {
        id: uuidv4(),
        userId: userId.toString(),
        title: fields.title || 'Untitled Task',
        description: fields.description || '',
        deadline,
        priority: fields.priority || 'medium',
        status: 'pending',
        estimatedDuration: fields.estimatedDuration || 0,
        labels: fields.labels || [],
        subtasks: [],
        recurring: !!recurrence,
        recurrenceRule: recurrence?.rule || null,
        recurrenceIntervalDays: recurrence?.intervalDays || null,
        nextDue: recurrence ? (deadline || computeNextDue(recurrence.rule)) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null
      };

      await db.collection('tasks').doc(taskData.id).set(taskData);
      logger.info('Task created', { userId, taskId: taskData.id, title: taskData.title, recurring: taskData.recurring });

      return taskData;
    } catch (error) {
      logger.error('Failed to create task', { error: error.message });
      throw error;
    }
  }

  // Called by the scheduler after a recurring task is completed — sets nextDue and resets status.
  async rescheduleRecurring(taskId) {
    try {
      const doc = await db.collection('tasks').doc(taskId).get();
      if (!doc.exists) return null;
      const task = doc.data();
      if (!task.recurring || !task.recurrenceRule) return null;

      const nextDue = computeNextDue(task.recurrenceRule, new Date());
      await db.collection('tasks').doc(taskId).update({
        status: 'pending',
        nextDue,
        completedAt: null,
        updatedAt: new Date()
      });
      logger.info('Task rescheduled', { taskId, nextDue });
      return nextDue;
    } catch (error) {
      logger.error('Failed to reschedule task', { error: error.message });
      return null;
    }
  }

  async getUserTasks(userId, status = 'pending') {
    try {
      const snapshot = await db
        .collection('tasks')
        .where('userId', '==', userId.toString())
        .where('status', '==', status)
        .orderBy('deadline', 'asc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch tasks', { error: error.message });
      return [];
    }
  }

  async updateStatus(taskId, status) {
    try {
      const updateData = {
        status,
        updatedAt: new Date(),
        ...(status === 'completed' && { completedAt: new Date() })
      };

      await db.collection('tasks').doc(taskId).update(updateData);
      logger.info('Task updated', { taskId, status });

      return updateData;
    } catch (error) {
      logger.error('Failed to update task', { error: error.message });
      throw error;
    }
  }

  async delete(taskId) {
    try {
      await db.collection('tasks').doc(taskId).delete();
      logger.info('Task deleted', { taskId });
      return true;
    } catch (error) {
      logger.error('Failed to delete task', { error: error.message });
      throw error;
    }
  }

  async deleteCompleted(userId) {
    try {
      const snapshot = await db
        .collection('tasks')
        .where('userId', '==', userId.toString())
        .where('status', '==', 'completed')
        .get();
      if (snapshot.empty) return 0;
      await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
      logger.info('Completed tasks deleted', { userId, count: snapshot.size });
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to delete completed tasks', { error: error.message });
      throw error;
    }
  }

  async deleteByDeadlineRange(userId, from, to) {
    try {
      const snapshot = await db
        .collection('tasks')
        .where('userId', '==', userId.toString())
        .where('deadline', '>=', from)
        .where('deadline', '<=', to)
        .get();
      if (snapshot.empty) return 0;
      await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
      logger.info('Tasks deleted by deadline range', { userId, from, to, count: snapshot.size });
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to delete tasks by deadline range', { error: error.message });
      throw error;
    }
  }

  async deleteToday(userId) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return this.deleteByDeadlineRange(userId, start, end);
  }

  async deleteThisWeek(userId) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return this.deleteByDeadlineRange(userId, start, now);
  }
}

export const taskService = new TaskService();
