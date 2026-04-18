import { query } from './db';

/**
 * Recalculate points for ALL tips based on current match results.
 * Returns number of tips updated.
 *
 * The CASE expression below must stay in sync with `calculateTipPoints`
 * in tip-scoring.ts — both encode the same scoring rule:
 *   - exact score: 4
 *   - correct outcome: 1
 *   - wrong outcome: 0
 *   - match not finished or goals NULL: NULL
 */
export async function recalculateAllTipPoints(): Promise<number> {
  const result = await query<{ id: number }>(
    `UPDATE tip t SET points = CASE
        WHEN m.status <> 'FINISHED' OR m.home_goals IS NULL OR m.away_goals IS NULL THEN NULL
        WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 4
        WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals)
          OR (t.home_goals < t.away_goals AND m.home_goals < m.away_goals)
          OR (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
        ELSE 0
     END
     FROM match m
     WHERE t.match_id = m.id
       AND t.points IS DISTINCT FROM (CASE
         WHEN m.status <> 'FINISHED' OR m.home_goals IS NULL OR m.away_goals IS NULL THEN NULL
         WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 4
         WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals)
           OR (t.home_goals < t.away_goals AND m.home_goals < m.away_goals)
           OR (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
         ELSE 0
       END)
     RETURNING t.id`,
  );

  return result.length;
}
