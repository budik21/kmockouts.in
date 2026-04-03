/**
 * FIFA World Ranking scraper.
 *
 * Fetches the current FIFA/Coca-Cola Men's World Ranking from
 * the official FIFA API and updates the `team.fifa_ranking` column
 * in the database.
 *
 * Source: api.fifa.com (official, returns all 211 teams)
 *
 * The ranking schedule ID encodes the publish date. Known dates:
 *   - 2026-04-01 → FRS_Male_Football_20260401
 *   - 2026-06-09 → FRS_Male_Football_20260609
 * We pick the most recent schedule that is ≤ today.
 */

import { getPool } from '../lib/db';

// ============================================================
// Ranking schedule dates (add new ones as FIFA publishes them)
// Format: [YYYY-MM-DD, scheduleId suffix]
// Must be sorted chronologically.
// ============================================================

const RANKING_SCHEDULES: [string, string][] = [
  ['2026-04-01', '20260401'],
  ['2026-06-09', '20260609'],
];

/**
 * Determine the most recent ranking schedule ID that is ≤ today.
 */
function getCurrentScheduleId(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let suffix = RANKING_SCHEDULES[0][1]; // fallback to earliest

  for (const [date, id] of RANKING_SCHEDULES) {
    if (date <= today) {
      suffix = id;
    } else {
      break;
    }
  }

  return `FRS_Male_Football_${suffix}`;
}

/**
 * Human-readable date for the ranking (e.g. "01 April 2026").
 */
function getScheduleLabel(scheduleId: string): string {
  const suffix = scheduleId.replace('FRS_Male_Football_', '');
  const entry = RANKING_SCHEDULES.find(([, id]) => id === suffix);
  if (!entry) return suffix;

  const d = new Date(entry[0] + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ============================================================
// FIFA API
// ============================================================

interface FifaRankingResult {
  IdCountry: string;      // e.g. "FRA", "ESP" — matches our short_name
  Rank: number;
  TotalPoints: number;
  TeamName: { Locale: string; Description: string }[];
}

interface FifaApiResponse {
  Results: FifaRankingResult[];
}

async function fetchFromFifaApi(scheduleId: string): Promise<FifaRankingResult[]> {
  const url = `https://api.fifa.com/api/v3/fifarankings/rankings/rankingsbyschedule?rankingScheduleId=${scheduleId}&language=en`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'KnockoutsIn/1.0',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`FIFA API returned ${response.status}`);
  }

  const data: FifaApiResponse = await response.json();

  if (!Array.isArray(data.Results) || data.Results.length === 0) {
    throw new Error('FIFA API returned empty results');
  }

  return data.Results;
}

// ============================================================
// Main scraper
// ============================================================

export async function scrapeFifaRankings(): Promise<void> {
  const scheduleId = getCurrentScheduleId();
  const dateLabel = getScheduleLabel(scheduleId);
  console.log(`  Using ranking schedule: ${scheduleId} (${dateLabel})`);

  const results = await fetchFromFifaApi(scheduleId);
  console.log(`  Fetched ${results.length} rankings from FIFA API`);

  // Get our teams from DB
  const pool = getPool();
  const { rows: teams } = await pool.query<{ id: number; short_name: string; name: string }>(
    'SELECT id, short_name, name FROM team'
  );

  let updated = 0;
  const missing: string[] = [];

  for (const team of teams) {
    // IdCountry in FIFA API matches our short_name directly
    const entry = results.find((r) => r.IdCountry === team.short_name);
    if (!entry) {
      missing.push(`${team.name} (${team.short_name})`);
      continue;
    }

    await pool.query(
      'UPDATE team SET fifa_ranking = $1 WHERE id = $2',
      [entry.Rank, team.id]
    );
    updated++;
  }

  if (missing.length > 0) {
    console.warn(`  Could not match rankings for: ${missing.join(', ')}`);
  }

  console.log(`  Updated FIFA ranking for ${updated}/${teams.length} teams`);

  // Log to scrape_log with source_date
  await pool.query(
    `INSERT INTO scrape_log (source, matches_updated, status, source_date)
     VALUES ('fifa-ranking', $1, 'OK', $2)`,
    [updated, dateLabel]
  );
}
