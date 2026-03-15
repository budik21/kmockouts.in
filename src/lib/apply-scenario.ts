import fs from 'fs';
import path from 'path';
import { getPool } from './db';

interface ScenarioResult {
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number;
  away_goals: number;
  home_yc: number;
  home_rc_direct: number;
  away_yc: number;
  away_rc_direct: number;
  status: string;
}

/**
 * Apply a scenario by ID to the database.
 * scenarioId=0 resets all matches to SCHEDULED.
 * Returns the number of matches applied (0 for reset).
 */
export async function applyScenario(scenarioId: number): Promise<number> {
  const pool = getPool();
  const scenariosDir = path.join(process.cwd(), 'data', 'scenarios');
  const flagPath = path.join(scenariosDir, '.active');

  if (scenarioId === 0) {
    await pool.query(`
      UPDATE match
      SET home_goals = NULL, away_goals = NULL,
          home_yc = 0, home_rc_direct = 0,
          away_yc = 0, away_rc_direct = 0,
          status = 'SCHEDULED', last_scraped = NULL
    `);
    fs.writeFileSync(flagPath, '0');
    return 0;
  }

  const scenarioFile = path.join(scenariosDir, `scenario-${scenarioId}.json`);
  if (!fs.existsSync(scenarioFile)) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }

  const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));
  const results: ScenarioResult[] = scenario.results ?? [];

  // Reset ALL matches to SCHEDULED first
  await pool.query(`
    UPDATE match
    SET home_goals = NULL, away_goals = NULL,
        home_yc = 0, home_rc_direct = 0,
        away_yc = 0, away_rc_direct = 0,
        status = 'SCHEDULED', last_scraped = NULL
  `);

  // Apply scenario results in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const r of results) {
      await client.query(
        `UPDATE match
         SET home_goals = $1, away_goals = $2,
             home_yc = $3, home_rc_direct = $4,
             away_yc = $5, away_rc_direct = $6,
             status = $7, last_scraped = NOW()
         WHERE group_id = $8 AND round = $9 AND home_team_id = $10 AND away_team_id = $11`,
        [
          r.home_goals, r.away_goals,
          r.home_yc ?? 0, r.home_rc_direct ?? 0,
          r.away_yc ?? 0, r.away_rc_direct ?? 0,
          r.status ?? 'FINISHED',
          r.group_id, r.round, r.home_team_id, r.away_team_id,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  fs.writeFileSync(flagPath, String(scenarioId));
  return results.length;
}

/**
 * Read the currently active scenario ID from the .active flag file.
 * Returns 0 if no scenario is active or file doesn't exist.
 */
export function readActiveScenarioId(): number {
  const flagPath = path.join(process.cwd(), 'data', 'scenarios', '.active');
  try {
    const content = fs.readFileSync(flagPath, 'utf-8').trim();
    const id = parseInt(content, 10);
    return isNaN(id) ? 0 : id;
  } catch {
    return 0;
  }
}
