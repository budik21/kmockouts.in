import { query } from './db';

/**
 * A tip whose points value just changed (either newly scored or rescored
 * after a result correction). Surfaced so the recalc route can trigger
 * e-mail notifications for transitions NULL -> number ("just scored").
 */
export interface TipTransition {
  tipId: number;
  userId: number;
  matchId: number;
  oldPoints: number | null;
  newPoints: number | null;
}

/**
 * Recalculate points for ALL tips based on current match results.
 * Returns the tips whose value actually changed, including their previous
 * and new `points` so callers can react to transitions.
 *
 * The CASE expression below must stay in sync with `calculateTipPoints`
 * in tip-scoring.ts — both encode the same scoring rule:
 *   - exact score: 4
 *   - correct outcome: 1
 *   - wrong outcome: 0
 *   - match not finished or goals NULL: NULL
 */
export async function recalculateAllTipPoints(): Promise<TipTransition[]> {
  interface Row {
    id: number;
    user_id: number;
    match_id: number;
    old_points: number | null;
    new_points: number | null;
  }

  const rows = await query<Row>(
    `WITH new_values AS (
        SELECT
          t.id,
          t.user_id,
          t.match_id,
          t.points AS old_points,
          CASE
            WHEN m.status <> 'FINISHED' OR m.home_goals IS NULL OR m.away_goals IS NULL THEN NULL
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 4
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals)
              OR (t.home_goals < t.away_goals AND m.home_goals < m.away_goals)
              OR (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS new_points
        FROM tip t
        JOIN match m ON m.id = t.match_id
     ),
     changed AS (
        SELECT id, user_id, match_id, old_points, new_points
        FROM new_values
        WHERE old_points IS DISTINCT FROM new_points
     ),
     updated AS (
        UPDATE tip t
           SET points = c.new_points
          FROM changed c
         WHERE t.id = c.id
        RETURNING t.id
     )
     SELECT c.id, c.user_id, c.match_id, c.old_points, c.new_points
       FROM changed c
       JOIN updated u ON u.id = c.id`,
  );

  return rows.map((r) => ({
    tipId: r.id,
    userId: r.user_id,
    matchId: r.match_id,
    oldPoints: r.old_points,
    newPoints: r.new_points,
  }));
}
