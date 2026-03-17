/**
 * FIFA World Ranking scraper.
 *
 * Fetches the current FIFA/Coca-Cola Men's World Ranking
 * and updates the `team.fifa_ranking` column in the database.
 *
 * Primary source: inside.fifa.com API
 * Fallback source: football-ranking.com (parsed HTML)
 */

import { getPool } from '../lib/db';

interface RankingEntry {
  name: string;   // team name as it appears on the ranking source
  rank: number;
}

// ============================================================
// Team name normalization (ranking source name → our DB short_name)
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
  // Playoff teams
  'italy': 'EPA', 'northern ireland': 'EPA', 'wales': 'EPA', 'bosnia and herzegovina': 'EPA',
  'turkey': 'EPC', 'türkiye': 'EPC', 'romania': 'EPC', 'slovakia': 'EPC', 'kosovo': 'EPC',
  'ukraine': 'EPB', 'sweden': 'EPB', 'poland': 'EPB', 'albania': 'EPB',
  'denmark': 'EPD', 'north macedonia': 'EPD', 'czechia': 'EPD', 'czech republic': 'EPD',
  'ireland': 'EPD', 'republic of ireland': 'EPD',
};

function normalizeRankingName(name: string): string | null {
  return RANKING_NAME_TO_SHORT[name.toLowerCase().trim()] ?? null;
}

// ============================================================
// Source: inside.fifa.com API
// ============================================================

async function fetchFromFifaApi(): Promise<RankingEntry[]> {
  // Try the inside.fifa.com ranking API
  const response = await fetch(
    'https://inside.fifa.com/api/ranking-overview?locale=en',
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'KnockoutsIn/1.0',
      },
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(`FIFA ranking API returned ${response.status}`);
  }

  const data = await response.json();
  const rankings = data?.rankings ?? [];

  if (!Array.isArray(rankings) || rankings.length === 0) {
    throw new Error('FIFA ranking API returned empty rankings');
  }

  return rankings.map((r: { rankingItem?: { name?: string; rank?: number }; name?: string; rank?: number }) => ({
    name: r.rankingItem?.name ?? r.name ?? '',
    rank: r.rankingItem?.rank ?? r.rank ?? 0,
  })).filter((r: RankingEntry) => r.name && r.rank > 0);
}

// ============================================================
// Source: football-ranking.com (fallback)
// ============================================================

async function fetchFromFootballRanking(): Promise<RankingEntry[]> {
  const entries: RankingEntry[] = [];

  // Fetch first 3 pages (150 teams — more than enough to cover all 48 WC teams)
  for (let page = 1; page <= 3; page++) {
    const url = page === 1
      ? 'https://football-ranking.com/fifa-world-rankings'
      : `https://football-ranking.com/fifa-world-rankings?page=${page}`;

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
    const pageEntries = parseFootballRankingHtml(html);
    entries.push(...pageEntries);

    if (pageEntries.length === 0) break;
  }

  return entries;
}

function parseFootballRankingHtml(html: string): RankingEntry[] {
  const entries: RankingEntry[] = [];

  // Actual HTML structure (multiline, with &nbsp;):
  //   <td style="text-align: left">1&nbsp;\n</td>
  //   <td><span><img .../>&nbsp;&nbsp;Spain <span ...>(ESP)</span></span></td>
  //
  // Strategy: normalize HTML first, then use a simple regex.
  const normalized = html
    .replace(/&nbsp;/g, ' ')   // replace &nbsp; with space
    .replace(/\s+/g, ' ');     // collapse all whitespace

  // Match: <td...>RANK </td> ... <td><span><img...> TeamName <span...>(CODE)</span></span></td>
  const rowPattern = /<td[^>]*>\s*(\d{1,3})\s*<\/td>\s*<td[^>]*><span>(?:<img[^>]*\/?>)\s*([^<]+?)\s*(?:<span[^>]*>\([A-Z]{3}\)<\/span>)?\s*<\/span><\/td>/gi;

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
  let entries: RankingEntry[] = [];

  // Try FIFA API first
  try {
    entries = await fetchFromFifaApi();
    if (entries.length > 0) {
      console.log(`  Fetched ${entries.length} rankings from FIFA API`);
    }
  } catch (err) {
    console.warn('  FIFA API failed, trying fallback:', err);
  }

  // Fallback to football-ranking.com
  if (entries.length === 0) {
    try {
      entries = await fetchFromFootballRanking();
      console.log(`  Fetched ${entries.length} rankings from football-ranking.com`);
    } catch (err) {
      console.error('  Fallback ranking source also failed:', err);
      throw new Error('Could not fetch FIFA rankings from any source');
    }
  }

  if (entries.length === 0) {
    console.warn('  No ranking entries found from any source');
    return;
  }

  // Get our teams from DB
  const pool = getPool();
  const { rows: teams } = await pool.query<{ id: number; short_name: string; name: string }>(
    'SELECT id, short_name, name FROM team'
  );

  let updated = 0;
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

  console.log(`  Updated FIFA ranking for ${updated}/${teams.length} teams`);

  // Log to scrape_log
  await pool.query(
    `INSERT INTO scrape_log (source, matches_updated, status)
     VALUES ('fifa-ranking', $1, 'OK')`,
    [updated]
  );
}
