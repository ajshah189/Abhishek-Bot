import { logger } from '../../utils/logger.js';

class ContextCache {
  constructor(ttlMs = 30000) {
    this.cache  = new Map();
    this.ttlMs  = ttlMs;
  }

  get(userId) {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(userId);
      return null;
    }
    return entry.data;
  }

  set(userId, data) {
    this.cache.set(userId, { data, timestamp: Date.now() });
  }

  invalidate(userId) {
    this.cache.delete(userId);
    logger.debug('Context cache invalidated', { userId });
  }

  invalidateAll() {
    this.cache.clear();
  }
}

export const contextCache = new ContextCache(30000);
