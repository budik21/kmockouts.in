import fs from 'fs';
import path from 'path';
import { getPool } from './db';

interface SeedMatch {
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  venue: string;
  kick_off: string;
}

/**
 * Sync kick_off and venue from data/seed/matches.json into the database.
 * This ensures the DB always reflects the latest schedule from the seed file.
 * Only updates kick_off and venue — does not touch goals, status, or cards.
 */
export async function syncMatchSchedule(): Promise<number> {
  const seedPath = path.join(process.cwd(), 'data', 'seed', 'matches.json');
  const matches: SeedMatch[] = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const pool = getPool();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of matches) {
      await client.query(
        `UPDATE match SET kick_off = $1, venue = $2
         WHERE group_id = $3 AND round = $4 AND home_team_id = $5 AND away_team_id = $6`,
        [m.kick_off, m.venue, m.group_id, m.round, m.home_team_id, m.away_team_id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return matches.length;
}
