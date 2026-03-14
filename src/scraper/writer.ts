/**
 * Writer: updates the SQLite database with scraped match results.
 */

import { getDb } from '../lib/db';
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
export function writeMatchUpdates(updates: ParsedMatchUpdate[]): number {
  const db = getDb();
  let updatedCount = 0;

  // Build team lookup by short_name
  const allTeams = db.prepare('SELECT id, short_name, group_id FROM team').all() as TeamLookup[];
  const teamByShortName = new Map<string, TeamLookup>();
  for (const t of allTeams) {
    teamByShortName.set(t.short_name, t);
  }

  // All matches
  const allMatches = db.prepare('SELECT id, home_team_id, away_team_id, status FROM match').all() as MatchLookup[];

  const updateStmt = db.prepare(`
    UPDATE match
    SET home_goals = ?, away_goals = ?,
        home_yc = ?, home_rc_direct = ?,
        away_yc = ?, away_rc_direct = ?,
        status = ?, last_scraped = datetime('now')
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
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
      updateStmt.run(
        update.homeGoals,
        update.awayGoals,
        update.homeYc,
        update.homeRcDirect,
        update.awayYc,
        update.awayRcDirect,
        update.status,
        match.id
      );

      updatedCount++;
    }
  });

  transaction();

  // Log the scrape
  db.prepare(`
    INSERT INTO scrape_log (source, matches_updated, status)
    VALUES ('fifa-api', ?, 'OK')
  `).run(updatedCount);

  return updatedCount;
}
