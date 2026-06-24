/**
 * Recalculate play-off pick'em points after a knockout result changes.
 *
 *   - knockout_tip.points: 8 for an exact 90' score + 5 for the correct
 *     advancing team (NULL until the match is decided).
 *   - playoff_pick.points: 25 champion / 20 runner-up / 10 per losing
 *     semifinalist (NULL until the deciding match is finished).
 *
 * Both the SQL CASE below and the JS in lib/playoff-scoring.ts must agree.
 */
import { query } from './db';
import {
  KO_EXACT_POINTS,
  KO_ADVANCE_POINTS,
  PLAYOFF_PICK_POINTS,
  PLAYOFF_PICK_SLOTS,
  PLAYOFF_PICK_WRONG_PLACE_POINTS,
  PLAYOFF_PICK_ALL_EXACT_BONUS,
  type PlayoffPickSlot,
} from './playoff-scoring';

/** Recompute every knockout_tip's points from the current match results. */
export async function recalculateKnockoutTips(): Promise<number> {
  const rows = await query<{ id: number }>(
    `UPDATE knockout_tip kt
     SET points = sub.new_points, updated_at = NOW()
     FROM (
       SELECT kt.id,
         CASE
           WHEN km.status <> 'FINISHED' OR km.advancing_team_id IS NULL THEN NULL
           ELSE
             (CASE WHEN kt.home_goals = km.home_goals AND kt.away_goals = km.away_goals
                   THEN ${KO_EXACT_POINTS} ELSE 0 END)
           + (CASE WHEN kt.advance_team_id = km.advancing_team_id
                   THEN ${KO_ADVANCE_POINTS} ELSE 0 END)
         END AS new_points
       FROM knockout_tip kt
       JOIN knockout_match km ON km.match_number = kt.match_number
     ) sub
     WHERE sub.id = kt.id AND kt.points IS DISTINCT FROM sub.new_points
     RETURNING kt.id`,
  );
  return rows.length;
}

/**
 * Recompute every playoff_pick's points. The four final placings come from the
 * final (match 104 → 1st/2nd) and the third-place match (103 → 3rd/4th). Picks
 * are scored only once BOTH are finished — that's when the full top-4 set is
 * known, which the "right team, wrong place" (10 pts) and the all-exact bonus
 * both depend on. Per slot: exact placing → its full value; team in the top 4
 * at another place → 10; otherwise 0. All four exact → a +50 bonus folded into
 * the champion pick (so the SUM-based leaderboard picks it up automatically).
 */
export async function recalculatePlayoffPicks(): Promise<number> {
  const rows = await query<{
    match_number: number; status: string;
    home_team_id: number | null; away_team_id: number | null; advancing_team_id: number | null;
  }>(
    `SELECT match_number, status, home_team_id, away_team_id, advancing_team_id
     FROM knockout_match WHERE match_number IN (103, 104)`,
  );
  const byNum = new Map(rows.map((r) => [r.match_number, r]));

  const decided = (m?: { status: string; home_team_id: number | null; away_team_id: number | null; advancing_team_id: number | null }) =>
    !!m && m.status === 'FINISHED' && m.advancing_team_id != null && m.home_team_id != null && m.away_team_id != null;
  const loserOf = (m: { home_team_id: number | null; away_team_id: number | null; advancing_team_id: number | null }) =>
    m.home_team_id === m.advancing_team_id ? m.away_team_id! : m.home_team_id!;

  const final = byNum.get(104);
  const third = byNum.get(103);
  const allDone = decided(final) && decided(third);

  let placement: Record<PlayoffPickSlot, number> | null = null;
  let top4: Set<number> | null = null;
  if (allDone) {
    const champion = final!.advancing_team_id!;
    const runnerUp = loserOf(final!);
    const third3 = third!.advancing_team_id!;
    const fourth = loserOf(third!);
    placement = { champion, runner_up: runnerUp, third: third3, fourth };
    top4 = new Set([champion, runnerUp, third3, fourth]);
  }

  const picks = await query<{ id: number; user_id: number; slot: string; team_id: number; points: number | null }>(
    `SELECT id, user_id, slot, team_id, points FROM playoff_pick`,
  );

  // Group by user so the all-exact bonus can be evaluated per player.
  const byUser = new Map<number, typeof picks>();
  for (const p of picks) {
    const arr = byUser.get(p.user_id) ?? [];
    arr.push(p);
    byUser.set(p.user_id, arr);
  }

  let updated = 0;
  for (const [, userPicks] of byUser) {
    const target = new Map<number, number | null>(); // pickId → new points

    if (!allDone || !placement || !top4) {
      for (const p of userPicks) target.set(p.id, null);
    } else {
      const bySlot = new Map<string, { id: number; team_id: number }>();
      for (const p of userPicks) bySlot.set(p.slot, { id: p.id, team_id: p.team_id });

      for (const p of userPicks) {
        if (!(PLAYOFF_PICK_SLOTS as string[]).includes(p.slot)) { target.set(p.id, null); continue; }
        const slot = p.slot as PlayoffPickSlot;
        if (p.team_id === placement[slot]) target.set(p.id, PLAYOFF_PICK_POINTS[slot]);
        else if (top4.has(p.team_id)) target.set(p.id, PLAYOFF_PICK_WRONG_PLACE_POINTS);
        else target.set(p.id, 0);
      }

      // All four placings exactly right → fold the bonus into the champion pick.
      const allExact = PLAYOFF_PICK_SLOTS.every((s) => bySlot.get(s)?.team_id === placement![s]);
      const champ = bySlot.get('champion');
      if (allExact && champ) {
        target.set(champ.id, (target.get(champ.id) ?? 0) + PLAYOFF_PICK_ALL_EXACT_BONUS);
      }
    }

    for (const p of userPicks) {
      const newPoints = target.get(p.id) ?? null;
      if (p.points !== newPoints) {
        await query('UPDATE playoff_pick SET points = $1, updated_at = NOW() WHERE id = $2', [newPoints, p.id]);
        updated++;
      }
    }
  }
  return updated;
}

/** Convenience: recompute both knockout tips and top-4 picks. */
export async function recalculateAllPlayoffPoints(): Promise<{ tips: number; picks: number }> {
  const tips = await recalculateKnockoutTips();
  const picks = await recalculatePlayoffPicks();
  return { tips, picks };
}
