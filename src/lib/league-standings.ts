import { expireTags } from '@/lib/cache-expire';
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
    `WITH g AS (
        SELECT user_id,
          COUNT(*)                                AS total,
          COUNT(*) FILTER (WHERE points = 4)       AS exact,
          COUNT(*) FILTER (WHERE points = 1)       AS outcome,
          COUNT(*) FILTER (WHERE points = 0)       AS wrong,
          COUNT(*) FILTER (WHERE points IS NULL)   AS pending,
          COALESCE(SUM(CASE WHEN points IS NOT NULL THEN points ELSE 0 END), 0) AS pts
        FROM tip GROUP BY user_id
     ),
     k AS (
        SELECT kt.user_id,
          COUNT(*)                                                                              AS total,
          COUNT(*) FILTER (WHERE km.status = 'FINISHED' AND kt.home_goals = km.home_goals
                                  AND kt.away_goals = km.away_goals)                            AS exact,
          COUNT(*) FILTER (WHERE km.status = 'FINISHED' AND kt.advance_team_id = km.advancing_team_id) AS advance,
          COUNT(*) FILTER (WHERE kt.points = 0)                                                 AS wrong,
          COUNT(*) FILTER (WHERE kt.points IS NULL)                                             AS pending,
          COALESCE(SUM(kt.points), 0)                                                           AS pts
        FROM knockout_tip kt JOIN knockout_match km ON km.match_number = kt.match_number
        GROUP BY kt.user_id
     ),
     p AS (
        SELECT user_id,
          COUNT(*)                                AS total,
          COUNT(*) FILTER (WHERE points > 0)       AS correct,
          COUNT(*) FILTER (WHERE points = 0)       AS wrong,
          COUNT(*) FILTER (WHERE points IS NULL)   AS pending,
          COALESCE(SUM(points), 0)                 AS pts
        FROM playoff_pick GROUP BY user_id
     ),
     per_member AS (
        -- One row per membership; group / knockout / pick aggregates are each
        -- pre-aggregated per user, so these joins are 1:1 (no fan-out).
        SELECT
          m.league_id,
          m.user_id,
          COALESCE(g.total, 0) + COALESCE(k.total, 0) + COALESCE(p.total, 0)               AS total_tips,
          COALESCE(g.exact, 0) + COALESCE(k.exact, 0)                                       AS exact_count,
          COALESCE(g.outcome, 0) + COALESCE(k.advance, 0) + COALESCE(p.correct, 0)          AS outcome_count,
          COALESCE(g.wrong, 0) + COALESCE(k.wrong, 0) + COALESCE(p.wrong, 0)                AS wrong_count,
          COALESCE(g.pending, 0) + COALESCE(k.pending, 0) + COALESCE(p.pending, 0)          AS pending_count,
          COALESCE(g.pts, 0) + COALESCE(k.pts, 0) + COALESCE(p.pts, 0)                       AS total_points,
          u.name AS user_name
        FROM pickem_league_member m
        JOIN tipster_user u ON u.id = m.user_id
        LEFT JOIN g ON g.user_id = m.user_id
        LEFT JOIN k ON k.user_id = m.user_id
        LEFT JOIN p ON p.user_id = m.user_id
        ${leagueFilter}
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
    expireTags(leagueStandingsTag(row.code));
  }
}
