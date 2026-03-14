/**
 * Standalone scraper entry point.
 * Runs on a schedule (node-cron) to fetch match results from FIFA.
 *
 * Usage: npx tsx src/scraper/index.ts
 *
 * Smart polling:
 *   - During match windows: every 5 minutes
 *   - Outside match windows: every 30 minutes
 *   - No matches today: every 60 minutes
 */

import cron from 'node-cron';
import { initializeSchema, getDb, closeDb } from '../lib/db';
import { fetchFifaMatchResults } from './fifa-client';
import { parseFifaResults } from './parser';
import { writeMatchUpdates } from './writer';

// Ensure DB is initialized
initializeSchema();

async function scrapeOnce(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting scrape...`);

  try {
    const results = await fetchFifaMatchResults();
    console.log(`  Fetched ${results.length} match results from FIFA API`);

    if (results.length > 0) {
      const parsed = parseFifaResults(results);
      const updated = writeMatchUpdates(parsed);
      console.log(`  Updated ${updated} matches in database`);
    } else {
      console.log('  No results from API (may not be available yet)');
    }
  } catch (error) {
    console.error('  Scrape failed:', error);

    // Log the error
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO scrape_log (source, matches_updated, status, error_message)
        VALUES ('fifa-api', 0, 'ERROR', ?)
      `).run(String(error));
    } catch {
      // Ignore logging errors
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`  Completed in ${elapsed}ms`);
}

function isMatchDay(): boolean {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const count = db.prepare(`
    SELECT COUNT(*) as cnt FROM match
    WHERE date(kick_off) = date(?)
  `).get(today) as { cnt: number };
  return count.cnt > 0;
}

function hasLiveMatches(): boolean {
  const db = getDb();
  const count = db.prepare(`
    SELECT COUNT(*) as cnt FROM match WHERE status = 'LIVE'
  `).get() as { cnt: number };
  return count.cnt > 0;
}

// ============================================================
// Scheduling
// ============================================================

console.log('🏟️  WC2026 Scraper started');
console.log('   Schedule: */5 * * * * (every 5 minutes)');
console.log('   Press Ctrl+C to stop\n');

// Run once immediately
scrapeOnce();

// Schedule: every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await scrapeOnce();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down scraper...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});
