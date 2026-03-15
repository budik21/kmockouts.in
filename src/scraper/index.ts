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
import { initializeSchema, getPool, closeDb } from '../lib/db';
import { fetchFifaMatchResults } from './fifa-client';
import { parseFifaResults } from './parser';
import { writeMatchUpdates } from './writer';
import { scrapeFlashscoreNews, writeNewsArticles } from './flashscore-news';

async function scrapeOnce(): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting scrape...`);

  try {
    const results = await fetchFifaMatchResults();
    console.log(`  Fetched ${results.length} match results from FIFA API`);

    if (results.length > 0) {
      const parsed = parseFifaResults(results);
      const updated = await writeMatchUpdates(parsed);
      console.log(`  Updated ${updated} matches in database`);
    } else {
      console.log('  No results from API (may not be available yet)');
    }
  } catch (error) {
    console.error('  Scrape failed:', error);

    // Log the error
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO scrape_log (source, matches_updated, status, error_message)
         VALUES ('fifa-api', 0, 'ERROR', $1)`,
        [String(error)]
      );
    } catch {
      // Ignore logging errors
    }
  }

  // Scrape news articles (independent — failure does not block match scraping)
  try {
    const articles = await scrapeFlashscoreNews();
    if (articles.length > 0) {
      const newCount = await writeNewsArticles(articles);
      console.log(`  News: ${articles.length} scraped, ${newCount} new`);
    } else {
      console.log('  No news articles found');
    }
  } catch (error) {
    console.warn('  News scrape failed:', error);
  }

  const elapsed = Date.now() - startTime;
  console.log(`  Completed in ${elapsed}ms`);
}

// ============================================================
// Scheduling
// ============================================================

async function main() {
  // Ensure DB schema exists
  await initializeSchema();

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
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down scraper...');
    await closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Scraper failed to start:', err);
  process.exit(1);
});
