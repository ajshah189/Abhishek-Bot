import express from 'express';
import { taskService } from '../services/tasks/taskService.js';
import { plannerService } from '../services/planner/plannerService.js';
import { searchService } from '../services/search/searchService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/tasks', async (req, res) => {
  try {
    const { userId } = req.query;
    const tasks = await taskService.getUserTasks(userId, 'pending');
    res.json({ tasks, count: tasks.length });
  } catch (error) {
    logger.error('Failed to fetch tasks', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/daily-brief', async (req, res) => {
  try {
    const { userId } = req.query;
    const brief = await plannerService.getDailyBrief(userId);
    res.json(brief);
  } catch (error) {
    logger.error('Failed to get daily brief', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { userId, query } = req.query;
    const results = await searchService.globalSearch(userId, query);
    res.json(results);
  } catch (error) {
    logger.error('Search failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
