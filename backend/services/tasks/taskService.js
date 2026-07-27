import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class TaskService {
  async create(userId, fields) {
    try {
      const taskData = {
        id: uuidv4(),
        userId: userId.toString(),
        title: fields.title || 'Untitled Task',
        description: fields.description || '',
        deadline: fields.date ? new Date(fields.date) : null,
        priority: fields.priority || 'medium',
        status: 'pending',
        estimatedDuration: fields.estimatedDuration || 0,
        labels: fields.labels || [],
        subtasks: [],
        recurring: false,
        recurrenceRule: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null
      };

      await db.collection('tasks').doc(taskData.id).set(taskData);
      logger.info('Task created', { userId, taskId: taskData.id, title: taskData.title });

      return taskData;
    } catch (error) {
      logger.error('Failed to create task', { error: error.message });
      throw error;
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
}

export const taskService = new TaskService();
