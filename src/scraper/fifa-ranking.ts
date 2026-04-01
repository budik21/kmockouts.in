/**
 * FIFA World Ranking scraper.
 *
 * Fetches the current FIFA/Coca-Cola Men's World Ranking from
 * football-ranking.com and updates the `team.fifa_ranking` column
 * in the database.
 */

import { getPool } from '../lib/db';

interface RankingEntry {
  name: string;   // team name as it appears on the source
  rank: number;
}

// ============================================================
// Team name normalization (source name → our DB short_name)
// ============================================================

const RANKING_NAME_TO_SHORT: Record<string, string> = {
  'mexico': 'MEX', 'south africa': 'RSA', 'south korea': 'KOR', 'korea republic': 'KOR',
  'canada': 'CAN', 'qatar': 'QAT', 'switzerland': 'SUI',
  'brazil': 'BRA', 'morocco': 'MAR', 'haiti': 'HAI', 'scotland': 'SCO',
  'united states': 'USA', 'usa': 'USA', 'united states of america': 'USA',
  'paraguay': 'PAR', 'australia': 'AUS',
  'germany': 'GER', 'curaçao': 'CUW', 'curacao': 'CUW',
  'ivory coast': 'CIV', "côte d'ivoire": 'CIV', 'cote divoire': 'CIV',
  'ecuador': 'ECU',
  'netherlands': 'NED', 'holland': 'NED', 'japan': 'JPN', 'tunisia': 'TUN',
  'belgium': 'BEL', 'egypt': 'EGY', 'iran': 'IRN', 'ir iran': 'IRN',
  'new zealand': 'NZL',
  'spain': 'ESP', 'cape verde': 'CPV', 'cabo verde': 'CPV',
  'saudi arabia': 'KSA', 'uruguay': 'URU',
  'france': 'FRA', 'senegal': 'SEN', 'norway': 'NOR',
  'argentina': 'ARG', 'algeria': 'ALG', 'austria': 'AUT', 'jordan': 'JOR',
  'portugal': 'POR', 'uzbekistan': 'UZB', 'colombia': 'COL',
  'england': 'ENG', 'croatia': 'CRO', 'ghana': 'GHA', 'panama': 'PAN',
  // Confirmed playoff qualifiers
  'czech republic': 'CZE', 'czechia': 'CZE',
  'bosnia and herzegovina': 'BIH', 'bosnia-herzegovina': 'BIH', 'bosnia': 'BIH',
  'turkey': 'TUR', 'türkiye': 'TUR',
  'sweden': 'SWE',
  'iraq': 'IRQ',
  'congo dr': 'COD', 'dr congo': 'COD', 'democratic republic of the congo': 'COD',
  'dem. rep. congo': 'COD', 'congo': 'COD', 'rép. dém. du congo': 'COD',
};

function normalizeRankingName(name: string): string | null {
  return RANKING_NAME_TO_SHORT[name.toLowerCase().trim()] ?? null;
}

// ============================================================
// Source: football-ranking.com
// ============================================================

const BASE_URL = 'https://football-ranking.com/fifa-world-rankings';
const MAX_PAGES = 5;

interface ScrapeResult {
  entries: RankingEntry[];
  rankingDate: string | null;  // e.g. "01 April 2026"
}

async function fetchRankings(): Promise<ScrapeResult> {
  const entries: RankingEntry[] = [];
  let rankingDate: string | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'KnockoutsIn/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`  football-ranking.com page ${page} returned ${response.status}`);
      break;
    }

    const html = await response.text();

    // Extract ranking date from first page
    if (page === 1 && !rankingDate) {
      rankingDate = extractRankingDate(html);
    }

    const pageEntries = parseHtml(html);
    entries.push(...pageEntries);

    if (pageEntries.length === 0) break;
  }

  return { entries, rankingDate };
}

/**
 * Extract the ranking publish date from the page.
 * Looks for patterns like "01 April 2026" in the heading area.
 */
function extractRankingDate(html: string): string | null {
  const match = html.match(/(\d{1,2}\s+\w+\s+\d{4})/);
  return match?.[1] ?? null;
}

/**
 * Parse ranking rows from the HTML.
 *
 * Actual row structure (after whitespace collapse):
 *   <tr>
 *     <td style="text-align: left">1&nbsp; ... </td>
 *     <td><span><img .../>&nbsp;&nbsp;Spain <span ...>(ESP)</span></span></td>
 *     ...
 *   </tr>
 */
function parseHtml(html: string): RankingEntry[] {
  const entries: RankingEntry[] = [];

  const normalized = html
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // Match: <td...> RANK (with optional arrow/link after) </td> ... <td><span><img.../> TeamName <span...>(CODE)</span></span></td>
  const rowPattern = /<td[^>]*>\s*(\d{1,3})\s*(?:<a[^>]*>.*?<\/a>)?\s*<\/td>\s*<td[^>]*><span>(?:<img[^>]*\/?>)\s*([^<]+?)\s*(?:<span[^>]*>\([A-Z]{3}\)<\/span>)?\s*<\/span><\/td>/gi;

  let match;
  while ((match = rowPattern.exec(normalized)) !== null) {
    const rank = parseInt(match[1], 10);
    const name = match[2].trim();
    if (rank > 0 && rank <= 211 && name.length > 1) {
      entries.push({ name, rank });
    }
  }

  return entries;
}

// ============================================================
// Main scraper
// ============================================================

export async function scrapeFifaRankings(): Promise<void> {
  const { entries, rankingDate } = await fetchRankings();
  console.log(`  Fetched ${entries.length} rankings from football-ranking.com (date: ${rankingDate ?? 'unknown'})`);

  if (entries.length === 0) {
    console.warn('  No ranking entries found');
    return;
  }

  // Get our teams from DB
  const pool = getPool();
  const { rows: teams } = await pool.query<{ id: number; short_name: string; name: string }>(
    'SELECT id, short_name, name FROM team'
  );

  let updated = 0;
  const missing: string[] = [];

  for (const entry of entries) {
    const shortName = normalizeRankingName(entry.name);
    if (!shortName) continue;

    const team = teams.find((t) => t.short_name === shortName);
    if (!team) continue;

    await pool.query(
      'UPDATE team SET fifa_ranking = $1 WHERE id = $2',
      [entry.rank, team.id]
    );
    updated++;
  }

  // Report teams we couldn't match
  for (const team of teams) {
    const matched = entries.some((e) => normalizeRankingName(e.name) === team.short_name);
    if (!matched) missing.push(`${team.name} (${team.short_name})`);
  }
  if (missing.length > 0) {
    console.warn(`  Could not match rankings for: ${missing.join(', ')}`);
  }

  console.log(`  Updated FIFA ranking for ${updated}/${teams.length} teams`);

  // Log to scrape_log with source_date
  await pool.query(
    `INSERT INTO scrape_log (source, matches_updated, status, source_date)
     VALUES ('fifa-ranking', $1, 'OK', $2)`,
    [updated, rankingDate ?? null]
  );
}
