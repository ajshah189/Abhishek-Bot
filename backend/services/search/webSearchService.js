import { config } from 'dotenv';
config();

import axios from 'axios';
import { logger } from '../../utils/logger.js';

// ── Rate limiter: max 10 searches per 60 seconds ────────────────────────────
const recentSearchTimes = [];
const MAX_PER_MINUTE = 10;

function checkRateLimit() {
  const now = Date.now();
  while (recentSearchTimes.length && now - recentSearchTimes[0] > 60_000) {
    recentSearchTimes.shift();
  }
  if (recentSearchTimes.length >= MAX_PER_MINUTE) return false;
  recentSearchTimes.push(now);
  return true;
}

// ── DDG Instant Answer API — always available, no key needed ────────────────
async function instantAnswers(query) {
  const url = 'https://api.duckduckgo.com/';
  const res = await axios.get(url, {
    params: { q: query, format: 'json', no_redirect: 1, no_html: 1, skip_disambig: 1 },
    timeout: 8000
  });
  const d = res.data;
  const results = [];

  if (d.Abstract) {
    results.push({ title: d.Heading || query, snippet: d.Abstract, url: d.AbstractURL || d.AbstractSource || '' });
  }
  if (d.Answer) {
    results.push({ title: 'Direct answer', snippet: d.Answer, url: '' });
  }
  (d.RelatedTopics || []).slice(0, 4).forEach(t => {
    if (t.Text && t.FirstURL) {
      results.push({ title: t.Text.slice(0, 80), snippet: t.Text, url: t.FirstURL });
    }
  });
  return results;
}

// ── DDG scraper via duck-duck-scrape ────────────────────────────────────────
async function scraperSearch(query, maxResults) {
  const { default: DDG } = await import('duck-duck-scrape');
  const res = await DDG.search(query, { safeSearch: DDG.SafeSearchType.MODERATE });
  if (!res?.results?.length) return [];
  return res.results.slice(0, maxResults).map(r => ({
    title: r.title || '',
    snippet: r.description || '',
    url: r.url || ''
  }));
}

// ── News via duck-duck-scrape ────────────────────────────────────────────────
async function scraperNews(query, maxResults) {
  const { default: DDG } = await import('duck-duck-scrape');
  const res = await DDG.searchNews(query, { safeSearch: DDG.SafeSearchType.MODERATE });
  if (!res?.results?.length) return [];
  return res.results.slice(0, maxResults).map(r => ({
    title: r.title || '',
    snippet: r.excerpt || r.description || '',
    url: r.url || '',
    source: r.source || ''
  }));
}

export class WebSearchService {
  async search(query, maxResults = 5) {
    if (!checkRateLimit()) {
      logger.warn('Web search rate limited', { query });
      return [];
    }

    // 1. Try DDG scraper first (returns full web results with snippets)
    try {
      const results = await scraperSearch(query, maxResults);
      if (results.length) {
        logger.info('Web search OK (scraper)', { query, count: results.length });
        return results;
      }
    } catch (err) {
      logger.warn('DDG scraper failed, falling back to instant answers', { error: err.message });
    }

    // 2. Fallback: DDG Instant Answers API (structured, always available)
    try {
      const results = await instantAnswers(query);
      if (results.length) {
        logger.info('Web search OK (instant answers)', { query, count: results.length });
        return results;
      }
    } catch (err) {
      logger.warn('DDG instant answers failed', { error: err.message });
    }

    return [];
  }

  async searchNews(query, maxResults = 5) {
    if (!checkRateLimit()) {
      logger.warn('News search rate limited', { query });
      return [];
    }

    try {
      const results = await scraperNews(query, maxResults);
      if (results.length) {
        logger.info('News search OK', { query, count: results.length });
        return results;
      }
    } catch (err) {
      logger.warn('DDG news search failed, falling back to web search', { error: err.message });
    }

    // News fallback: regular web search
    return this.search(query + ' latest news', maxResults);
  }

  formatForLLM(results) {
    if (!results.length) return 'No search results found.';
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}${r.url ? `\nSource: ${r.url}` : ''}`)
      .join('\n\n');
  }

  formatForTelegram(results, heading = '🔍 Search Results') {
    if (!results.length) return 'No results found.';
    const lines = [`*${heading}*\n`];
    results.forEach((r, i) => {
      lines.push(`${i + 1}. *${r.title}*`);
      if (r.snippet) lines.push(`   ${r.snippet.slice(0, 120)}${r.snippet.length > 120 ? '…' : ''}`);
      if (r.url) lines.push(`   ${r.url}`);
    });
    return lines.join('\n');
  }
}

export const webSearchService = new WebSearchService();
