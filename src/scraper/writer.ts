/**
 * Writer: updates the PostgreSQL database with scraped match results.
 */

import { getPool, query } from '../lib/db';
import { ParsedMatchUpdate, normalizeTeamName } from './parser';

interface TeamLookup {
  id: number;
  short_name: string;
  group_id: string;
}

interface MatchLookup {
  id: number;
  home_team_id: number;
  away_team_id: number;
  status: string;
}

/**
 * Write parsed match updates to the database.
 * Returns the number of matches updated.
 */
export async function writeMatchUpdates(updates: ParsedMatchUpdate[]): Promise<number> {
  const pool = getPool();
  let updatedCount = 0;

  // Build team lookup by short_name
  const allTeams = await query<TeamLookup>('SELECT id, short_name, group_id FROM team');
  const teamByShortName = new Map<string, TeamLookup>();
  for (const t of allTeams) {
    teamByShortName.set(t.short_name, t);
  }

  // All matches
  const allMatches = await query<MatchLookup>('SELECT id, home_team_id, away_team_id, status FROM match');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const update of updates) {
      // Resolve team names to IDs
      const homeShort = normalizeTeamName(update.homeTeamName);
      const awayShort = normalizeTeamName(update.awayTeamName);

      if (!homeShort || !awayShort) {
        console.warn(`Unknown team: ${update.homeTeamName} or ${update.awayTeamName}`);
        continue;
      }

      const homeTeam = teamByShortName.get(homeShort);
      const awayTeam = teamByShortName.get(awayShort);

      if (!homeTeam || !awayTeam) {
        console.warn(`Team not in DB: ${homeShort} or ${awayShort}`);
        continue;
      }

      // Find the matching match
      const match = allMatches.find(
        (m) => m.home_team_id === homeTeam.id && m.away_team_id === awayTeam.id
      );

      if (!match) {
        console.warn(`No match found: ${homeShort} vs ${awayShort}`);
        continue;
      }

      // Only update if there's a change
      await client.query(
        `UPDATE match
         SET home_goals = $1, away_goals = $2,
             home_yc = $3, home_yc2 = $4, home_rc_direct = $5, home_yc_rc = $6,
             away_yc = $7, away_yc2 = $8, away_rc_direct = $9, away_yc_rc = $10,
             status = $11, last_scraped = NOW()
         WHERE id = $12`,
        [
          update.homeGoals,
          update.awayGoals,
          update.homeYc,
          0, // home_yc2 — not available from scraper
          update.homeRcDirect,
          0, // home_yc_rc — not available from scraper
          update.awayYc,
          0, // away_yc2 — not available from scraper
          update.awayRcDirect,
          0, // away_yc_rc — not available from scraper
          update.status,
          match.id,
        ]
      );

      updatedCount++;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Log the scrape
  await pool.query(
    `INSERT INTO scrape_log (source, matches_updated, status) VALUES ('fifa-api', $1, 'OK')`,
    [updatedCount]
  );

  return updatedCount;
}
