/**
 * Standalone scraper entry point.
 * Each scraper job has its own cron schedule.
 *
 * Usage: npx tsx src/scraper/index.ts
 */

import cron from 'node-cron';
import { initializeSchema, getPool, closeDb } from '../lib/db';
import { fetchFifaMatchResults } from './fifa-client';
import { parseFifaResults } from './parser';
import { writeMatchUpdates } from './writer';
import { scrapeFlashscoreNews, writeNewsArticles } from './flashscore-news';
import { scrapeFifaRankings } from './fifa-ranking';

// ============================================================
// Scraper job definitions
// ============================================================

interface ScraperJob {
  name: string;
  schedule: string; // cron expression
  run: () => Promise<void>;
}

async function scrapeFifa(): Promise<void> {
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
    console.error('  FIFA scrape failed:', error);

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
}

async function scrapeNews(): Promise<void> {
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
}

const jobs: ScraperJob[] = [
  {
    name: 'FIFA Results',
    schedule: '0 6 * * *',    // once daily at 06:00 UTC
    run: scrapeFifa,
  },
  {
    name: 'Flashscore News',
    schedule: '0 * * * *',    // every hour at :00
    run: scrapeNews,
  },
  {
    name: 'FIFA Rankings',
    schedule: '0 23 * * *',    // once daily at 23:00 UTC
    run: scrapeFifaRankings,
  },
  // Add more scrapers here:
  // {
  //   name: 'My New Scraper',
  //   schedule: '*/15 * * * *',  // every 15 min
  //   run: scrapeMyNewThing,
  // },
];

// ============================================================
// Runner
// ============================================================

async function runJob(job: ScraperJob): Promise<void> {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ▶ ${job.name}`);
  await job.run();
  console.log(`  ✓ ${job.name} done in ${Date.now() - start}ms\n`);
}

async function main() {
  await initializeSchema();

  console.log('🏟️  WC2026 Scraper started\n');
  console.log('   Registered jobs:');
  for (const job of jobs) {
    console.log(`     • ${job.name}  —  ${job.schedule}`);
  }
  console.log('');

  // Run all jobs once on startup
  for (const job of jobs) {
    await runJob(job);
  }

  // Schedule each job independently
  for (const job of jobs) {
    cron.schedule(job.schedule, () => runJob(job));
  }

  // Graceful shutdown
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
