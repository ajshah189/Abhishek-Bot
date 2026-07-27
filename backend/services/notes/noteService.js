import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class NoteService {
  async create(userId, fields) {
    try {
      const noteData = {
        id: uuidv4(),
        userId: userId.toString(),
        title: fields.title || 'Untitled Note',
        content: fields.description || fields.content || '',
        tags: fields.tags || [],
        category: fields.category || 'general',
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('notes').doc(noteData.id).set(noteData);
      logger.info('Note created', { userId, noteId: noteData.id });

      return noteData;
    } catch (error) {
      logger.error('Failed to create note', { error: error.message });
      throw error;
    }
  }

  async getUserNotes(userId) {
    try {
      const snapshot = await db
        .collection('notes')
        .where('userId', '==', userId.toString())
        .orderBy('updatedAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      logger.error('Failed to fetch notes', { error: error.message });
      return [];
    }
  }

  async searchNotes(userId, query) {
    const notes = await this.getUserNotes(userId);
    const queryLower = query.toLowerCase();

    return notes.filter(note =>
      note.title.toLowerCase().includes(queryLower) ||
      note.content.toLowerCase().includes(queryLower) ||
      note.tags.some(tag => tag.toLowerCase().includes(queryLower))
    );
  }

  async update(noteId, fields) {
    try {
      await db.collection('notes').doc(noteId).update({
        ...fields,
        updatedAt: new Date()
      });

      logger.info('Note updated', { noteId });
      return true;
    } catch (error) {
      logger.error('Failed to update note', { error: error.message });
      throw error;
    }
  }

  async delete(noteId) {
    try {
      await db.collection('notes').doc(noteId).delete();
      logger.info('Note deleted', { noteId });
      return true;
    } catch (error) {
      logger.error('Failed to delete note', { error: error.message });
      throw error;
    }
  }
}

export const noteService = new NoteService();
