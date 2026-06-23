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
import { KO_EXACT_POINTS, KO_ADVANCE_POINTS, PLAYOFF_PICK_POINTS } from './playoff-scoring';

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
 * Recompute every playoff_pick's points. Champion/runner-up resolve once the
 * final (match 104) is finished; semifinalist picks score as soon as a team is
 * a known losing semifinalist (loser of SF 101 / 102), and lock to 0 only once
 * both semifinals are finished.
 */
export async function recalculatePlayoffPicks(): Promise<number> {
  const rows = await query<{
    match_number: number; status: string;
    home_team_id: number | null; away_team_id: number | null; advancing_team_id: number | null;
  }>(
    `SELECT match_number, status, home_team_id, away_team_id, advancing_team_id
     FROM knockout_match WHERE match_number IN (101, 102, 104)`,
  );
  const byNum = new Map(rows.map((r) => [r.match_number, r]));

  const final = byNum.get(104);
  const finalDecided = final?.status === 'FINISHED' && final.advancing_team_id != null;
  const championId = finalDecided ? final!.advancing_team_id! : null;
  const runnerUpId = finalDecided
    ? (final!.home_team_id === championId ? final!.away_team_id : final!.home_team_id)
    : null;

  const sfLosers: number[] = [];
  let sfFinishedCount = 0;
  for (const num of [101, 102]) {
    const sf = byNum.get(num);
    if (sf?.status === 'FINISHED' && sf.advancing_team_id != null && sf.home_team_id != null && sf.away_team_id != null) {
      sfFinishedCount++;
      const loser = sf.home_team_id === sf.advancing_team_id ? sf.away_team_id : sf.home_team_id;
      sfLosers.push(loser);
    }
  }
  const bothSfDecided = sfFinishedCount === 2;

  const picks = await query<{ id: number; slot: string; team_id: number; points: number | null }>(
    `SELECT id, slot, team_id, points FROM playoff_pick`,
  );

  let updated = 0;
  for (const p of picks) {
    let newPoints: number | null;
    if (p.slot === 'champion') {
      newPoints = finalDecided ? (p.team_id === championId ? PLAYOFF_PICK_POINTS.champion : 0) : null;
    } else if (p.slot === 'runner_up') {
      newPoints = finalDecided ? (p.team_id === runnerUpId ? PLAYOFF_PICK_POINTS.runner_up : 0) : null;
    } else {
      // semifinalist_1 / semifinalist_2
      if (sfLosers.includes(p.team_id)) {
        newPoints = PLAYOFF_PICK_POINTS.semifinalist_1;
      } else if (bothSfDecided) {
        newPoints = 0;
      } else {
        newPoints = null;
      }
    }
    if (p.points !== newPoints) {
      await query('UPDATE playoff_pick SET points = $1, updated_at = NOW() WHERE id = $2', [newPoints, p.id]);
      updated++;
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
