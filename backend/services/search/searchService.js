import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { noteService } from '../notes/noteService.js';
import { memoryService } from '../memory/memoryService.js';

export class SearchService {
  async globalSearch(userId, query) {
    try {
      const results = {
        tasks: [],
        notes: [],
        memories: [],
        expenses: [],
        journal: []
      };

      const [tasksSnapshot, expensesSnapshot, journalSnapshot, notes, memories] = await Promise.all([
        db.collection('tasks').where('userId', '==', userId.toString()).get(),
        db.collection('expenses').where('userId', '==', userId.toString()).get(),
        db.collection('journal').where('userId', '==', userId.toString()).get(),
        noteService.searchNotes(userId, query),
        memoryService.search(userId, query)
      ]);

      const q = query.toLowerCase();

      results.tasks = tasksSnapshot.docs
        .map(doc => doc.data())
        .filter(t =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
        );

      results.expenses = expensesSnapshot.docs
        .map(doc => doc.data())
        .filter(e =>
          e.description.toLowerCase().includes(q) ||
          e.merchant.toLowerCase().includes(q)
        );

      results.journal = journalSnapshot.docs
        .map(doc => doc.data())
        .filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q)
        );

      results.notes = notes;
      results.memories = memories;

      const totalCount = Object.values(results).flat().length;
      logger.info('Global search completed', { userId, query, totalCount });

      return results;
    } catch (error) {
      logger.error('Search failed', { error: error.message });
      return { tasks: [], notes: [], memories: [], expenses: [], journal: [] };
    }
  }
}

export const searchService = new SearchService();
