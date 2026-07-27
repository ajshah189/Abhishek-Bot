import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import admin from '../../config/firebase.js';

export class ProjectService {
  async create(userId, fields) {
    try {
      const projectData = {
        id: uuidv4(),
        userId: userId.toString(),
        name: fields.title || 'New Project',
        description: fields.description || '',
        status: 'active',
        priority: fields.priority || 'medium',
        deadline: fields.date ? new Date(fields.date) : null,
        tasks: [],
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('projects').doc(projectData.id).set(projectData);
      logger.info('Project created', { userId, projectId: projectData.id });

      return projectData;
    } catch (error) {
      logger.error('Failed to create project', { error: error.message });
      throw error;
    }
  }

  async getUserProjects(userId, status = 'active') {
    try {
      const snapshot = await db
        .collection('projects')
        .where('userId', '==', userId.toString())
        .where('status', '==', status)
        .orderBy('updatedAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch projects', { error: error.message });
      return [];
    }
  }

  async addTask(projectId, taskTitle) {
    try {
      const taskId = uuidv4();
      await db.collection('projects').doc(projectId).update({
        tasks: admin.firestore.FieldValue.arrayUnion({
          id: taskId,
          title: taskTitle,
          completed: false
        })
      });

      logger.info('Task added to project', { projectId, taskId });
      return taskId;
    } catch (error) {
      logger.error('Failed to add task to project', { error: error.message });
      throw error;
    }
  }

  async updateProgress(projectId, progress) {
    try {
      await db.collection('projects').doc(projectId).update({
        progress,
        updatedAt: new Date()
      });

      logger.info('Project progress updated', { projectId, progress });
      return true;
    } catch (error) {
      logger.error('Failed to update project progress', { error: error.message });
      throw error;
    }
  }

  async delete(projectId) {
    try {
      await db.collection('projects').doc(projectId).delete();
      logger.info('Project deleted', { projectId });
      return true;
    } catch (error) {
      logger.error('Failed to delete project', { error: error.message });
      throw error;
    }
  }
}

export const projectService = new ProjectService();
