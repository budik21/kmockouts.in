/**
 * Best-third snapshot — the cross-group ranking of currently 3rd-placed teams
 * as the tournament progresses.
 *
 * The "best 8 of 12 third-placed teams" decision is only TRULY final once
 * every group-stage match across all 12 groups has been played. Until then,
 * the snapshot below is a moving target: each group's current 3rd-placed
 * team may still change, and the cross-group ranking shifts with every
 * result.
 *
 * Two consumers:
 *   1. The AI article prompts — so the model can describe a team's current
 *      chance of advancing as best-third in concrete, snapshot terms rather
 *      than treating a 100% probability as a guaranteed outcome before the
 *      table is locked.
 *   2. The /worldcup2026/best-third-placed table UI — so when two teams tie
 *      on points + GD, a small note explains which tiebreaker decided the
 *      order (goals scored, fair play, FIFA ranking).
 */

import { Match, Team, TeamStanding, GroupId } from '../lib/types';
import { ALL_GROUPS, QUALIFY_BEST_THIRD } from '../lib/constants';
import { calculateStandings } from './standings';
import { compareThirdPlaced } from './best-third';

export interface BestThirdSnapshotRow {
  rank: number;
  groupId: GroupId;
  teamId: number;
  teamName: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst: number;
  fairPlayPoints: number;
  fifaRanking?: number;
  /** True when this team's group has played every match (their 3rd-place
   *  status is locked for this group). False when their group is still in
   *  progress and the row is provisional. */
  groupFullyPlayed: boolean;
  /** Status against the top-8 qualifying line in THIS snapshot:
   *   - 'qualify'   → rank ≤ 8 in the current snapshot
   *   - 'eliminate' → rank > 8 in the current snapshot
   *  Note: this is the SNAPSHOT status, not a final qualification verdict —
   *  only when `isFinal === true` on the parent BestThirdSnapshot can the
   *  status be treated as the final outcome. */
  snapshotStatus: 'qualify' | 'eliminate';
}

export interface BestThirdSnapshot {
  rows: BestThirdSnapshotRow[];
  /** True when every group-stage match across all 12 groups is FINISHED.
   *  Only then is the ranking final and the top 8 actually qualified. */
  isFinal: boolean;
  /** Number of groups that already have every match played. 12 ⇒ isFinal. */
  groupsFullyPlayed: number;
  /** Human-readable tiebreaker explanations for the ranking, generated for
   *  pairs/clusters of rows that share points + GD. Empty array when the
   *  natural sort (pts → GD) already explains every row's position. */
  tiebreakerNotes: string[];
}

export interface GroupSnapshotInput {
  groupId: GroupId;
  teams: Team[];
  playedMatches: Match[];
  /** Total matches in this group (played + remaining). When this equals the
   *  number of FINISHED matches passed in, the group is fully decided. */
  totalMatches: number;
}

/**
 * Build a snapshot of currently 3rd-placed teams across all groups, ranked
 * by FIFA Article 13 (points → GD → goals scored → fair play → FIFA rank).
 *
 * Returns `null` if any group has not produced enough finished matches to
 * have a 3rd-placed standing yet.
 */
export function buildBestThirdSnapshot(
  groups: GroupSnapshotInput[],
): BestThirdSnapshot {
  const entries: { groupInput: GroupSnapshotInput; standing: TeamStanding }[] = [];
  let groupsFullyPlayed = 0;

  for (const g of groups) {
    if (g.playedMatches.length === g.totalMatches && g.totalMatches > 0) {
      groupsFullyPlayed++;
    }
    const standings = calculateStandings({ teams: g.teams, matches: g.playedMatches });
    const third = standings.find(s => s.position === 3);
    if (third) {
      entries.push({ groupInput: g, standing: third });
    }
  }

  entries.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

  const rows: BestThirdSnapshotRow[] = entries.map((e, i) => ({
    rank: i + 1,
    groupId: e.groupInput.groupId,
    teamId: e.standing.team.id,
    teamName: e.standing.team.name,
    points: e.standing.points,
    goalDifference: e.standing.goalDifference,
    goalsFor: e.standing.goalsFor,
    goalsAgainst: e.standing.goalsAgainst,
    fairPlayPoints: e.standing.fairPlayPoints,
    fifaRanking: e.standing.team.fifaRanking,
    groupFullyPlayed: e.groupInput.playedMatches.length === e.groupInput.totalMatches && e.groupInput.totalMatches > 0,
    snapshotStatus: i + 1 <= QUALIFY_BEST_THIRD ? 'qualify' : 'eliminate',
  }));

  const isFinal = groupsFullyPlayed === ALL_GROUPS.length;
  const tiebreakerNotes = explainBestThirdTiebreakers(rows);

  return { rows, isFinal, groupsFullyPlayed, tiebreakerNotes };
}

/**
 * Analyse the snapshot rows and return human-readable explanations for
 * non-obvious tiebreaker decisions — i.e. where two or more rows share
 * points + GD and the natural sort needed FIFA Article 13 step c/d/e to
 * separate them.
 *
 * Returns an empty array when every row is separated by points or GD alone.
 */
export function explainBestThirdTiebreakers(rows: BestThirdSnapshotRow[]): string[] {
  const notes: string[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (
      j < rows.length &&
      rows[j].points === rows[i].points &&
      rows[j].goalDifference === rows[i].goalDifference
    ) {
      j++;
    }
    if (j - i >= 2) {
      const note = describeBlock(rows.slice(i, j));
      if (note) notes.push(note);
    }
    i = j;
  }
  return notes;
}

function describeBlock(block: BestThirdSnapshotRow[]): string | null {
  const pts = block[0].points;
  const gd = block[0].goalDifference;
  const gdStr = gd >= 0 ? `+${gd}` : `${gd}`;
  const names = block.map(r => r.teamName).join(', ');

  // Goals scored varies?
  const gfs = block.map(r => r.goalsFor);
  if (!allEqual(gfs)) {
    const detail = block.map(r => `${r.teamName} ${r.goalsFor}`).join(', ');
    return `${names} tied on ${pts} pts, ${gdStr} GD — ranked by goals scored: ${detail}`;
  }

  // Fair play varies? (lower disciplinary count = higher fair-play value here)
  const fps = block.map(r => r.fairPlayPoints);
  if (!allEqual(fps)) {
    const detail = block.map(r => `${r.teamName} ${r.fairPlayPoints}`).join(', ');
    return `${names} tied on ${pts} pts, ${gdStr} GD, equal goals scored — ranked by fair-play points: ${detail}`;
  }

  // FIFA ranking varies?
  const ranks = block.map(r => r.fifaRanking ?? null);
  if (ranks.some(r => r !== null) && new Set(ranks).size > 1) {
    const detail = block.map(r => `${r.teamName} ${r.fifaRanking ?? '–'}`).join(', ');
    return `${names} fully tied on group stats — ranked by FIFA World Ranking: ${detail}`;
  }

  // Truly equal; should not happen in practice.
  return `${names} fully tied — order undecided by Article 13 criteria.`;
}

function allEqual(values: number[]): boolean {
  return values.every(v => v === values[0]);
}
