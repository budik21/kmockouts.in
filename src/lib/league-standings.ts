import { revalidateTag } from 'next/cache';
import { query } from './db';
import { leagueStandingsTag } from './cache-tags';

/**
 * Recompute pickem_league_standings rows for the given league(s) by joining
 * each member with their tip points.
 *
 * Strategy:
 *   1. UPSERT a fresh standings row for every (league, member) pair.
 *   2. DELETE orphans whose membership no longer exists (e.g. someone left
 *      between recalcs, or this is a one-league recalc with no members).
 *
 * Pass `null` to recompute every league. Pass an id to recompute just one.
 *
 * Tie-breaker matches the global leaderboard:
 *   totalPoints DESC, exact DESC, outcome DESC, totalTips ASC, name ASC
 */
export async function recalculateLeagueStandings(leagueId: number | null = null): Promise<void> {
  const params: unknown[] = [];
  let leagueFilter = '';
  let standingsFilter = '';
  if (leagueId !== null) {
    params.push(leagueId);
    leagueFilter = 'WHERE m.league_id = $1';
    standingsFilter = 'WHERE s.league_id = $1';
  }

  await query(
    `WITH per_member AS (
        SELECT
          m.league_id,
          m.user_id,
          COUNT(t.id)                                AS total_tips,
          COUNT(t.id) FILTER (WHERE t.points = 4)    AS exact_count,
          COUNT(t.id) FILTER (WHERE t.points = 1)    AS outcome_count,
          COUNT(t.id) FILTER (WHERE t.points = 0)    AS wrong_count,
          COUNT(t.id) FILTER (WHERE t.points IS NULL) AS pending_count,
          COALESCE(SUM(CASE WHEN t.points IS NOT NULL THEN t.points ELSE 0 END), 0) AS total_points,
          u.name AS user_name
        FROM pickem_league_member m
        LEFT JOIN tip t ON t.user_id = m.user_id
        JOIN tipster_user u ON u.id = m.user_id
        ${leagueFilter}
        GROUP BY m.league_id, m.user_id, u.name
     ),
     ranked AS (
        SELECT
          league_id,
          user_id,
          total_tips, exact_count, outcome_count, wrong_count, pending_count, total_points,
          ROW_NUMBER() OVER (
            PARTITION BY league_id
            ORDER BY total_points DESC, exact_count DESC, outcome_count DESC,
                     total_tips ASC, user_name ASC
          ) AS rank
        FROM per_member
     )
     INSERT INTO pickem_league_standings
       (league_id, user_id, total_tips, exact_count, outcome_count,
        wrong_count, pending_count, total_points, rank, updated_at)
     SELECT league_id, user_id, total_tips, exact_count, outcome_count,
            wrong_count, pending_count, total_points, rank, NOW()
       FROM ranked
     ON CONFLICT (league_id, user_id) DO UPDATE SET
       total_tips    = EXCLUDED.total_tips,
       exact_count   = EXCLUDED.exact_count,
       outcome_count = EXCLUDED.outcome_count,
       wrong_count   = EXCLUDED.wrong_count,
       pending_count = EXCLUDED.pending_count,
       total_points  = EXCLUDED.total_points,
       rank          = EXCLUDED.rank,
       updated_at    = NOW()`,
    params,
  );

  // Drop standings rows whose membership row no longer exists (left league
  // or league deleted). Scoped to the same league filter so we don't touch
  // other leagues unnecessarily.
  await query(
    `DELETE FROM pickem_league_standings s
      ${standingsFilter}${standingsFilter ? ' AND ' : 'WHERE '}NOT EXISTS (
        SELECT 1 FROM pickem_league_member m
         WHERE m.league_id = s.league_id AND m.user_id = s.user_id
      )`,
    params,
  );

  // Invalidate per-league cache tags so the public leaderboard re-renders.
  const codeRows = await query<{ code: string }>(
    leagueId !== null
      ? 'SELECT code FROM pickem_league WHERE id = $1'
      : 'SELECT code FROM pickem_league',
    leagueId !== null ? [leagueId] : [],
  );
  for (const row of codeRows) {
    revalidateTag(leagueStandingsTag(row.code), 'max');
  }
}
