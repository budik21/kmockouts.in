/**
 * Shared row-builder for the pick'em leaderboards (global + per-league), so both
 * compute the All / Groups / Play-off breakdowns identically.
 *
 * The SQL that produces the per-user aggregates lives in each page (the global
 * board scans every public predictor; a league scans only its members), but the
 * scoring maths and column shape are unified here.
 */
import { PLAYOFF_PICK_POINTS, PLAYOFF_PICK_ALL_EXACT_BONUS } from './playoff-scoring';

export type LeaderboardView = 'all' | 'groups' | 'playoff';

export interface LeaderboardRow {
  /** Public share token, or null when the predictor's profile isn't public. */
  shareToken: string | null;
  /** Stable identity for keying/highlighting when the share token may be null. */
  userId?: number;
  name: string;
  nameSuffix: string | null;
  totalTips: number;
  exact: number;
  outcome: number;
  wrong: number;
  pending: number;
  totalPoints: number;
  /** Play-off-only points (knockout tips + top-4 picks); shown in the All view. */
  playoffPoints: number;
  /** Play-off view breakdown: correct advancing picks, and correct top-4 placings. */
  advancing: number;
  top4: number;
  /** Earned the +50 all-exact top-4 bonus (shown as a 🚀 next to the name). */
  hasBonus: boolean;
}

export interface GroupStageAgg { total: number; exact: number; outcome: number; wrong: number; pending: number; }
export interface KnockoutAgg { total: number; exact: number; advance: number; wrong: number; pending: number; points: number; }
export interface PickAgg { total: number; correct: number; wrong: number; pending: number; points: number; champPts: number | null; }

export interface LeaderboardBase {
  shareToken: string | null;
  userId?: number;
  name: string;
  nameSuffix: string | null;
}

/**
 * Assemble one leaderboard row for the chosen scope. Returns null for a
 * predictor with no relevant tips, unless `keepEmpty` is set (leagues keep all
 * members visible at zero, the global board drops them).
 */
export function buildLeaderboardRow(
  base: LeaderboardBase,
  kind: LeaderboardView,
  g: GroupStageAgg | undefined,
  k: KnockoutAgg | undefined,
  p: PickAgg | undefined,
  keepEmpty = false,
): LeaderboardRow | null {
  const gTotal = g?.total ?? 0, gExact = g?.exact ?? 0, gOutcome = g?.outcome ?? 0, gWrong = g?.wrong ?? 0, gPending = g?.pending ?? 0;
  const gPoints = gExact * 4 + gOutcome;
  const kTotal = k?.total ?? 0, kExact = k?.exact ?? 0, kAdvance = k?.advance ?? 0, kWrong = k?.wrong ?? 0, kPending = k?.pending ?? 0, kPoints = k?.points ?? 0;
  const pTotal = p?.total ?? 0, pCorrect = p?.correct ?? 0, pWrong = p?.wrong ?? 0, pPending = p?.pending ?? 0, pPoints = p?.points ?? 0;

  const playoffPoints = kPoints + pPoints;
  // The +50 bonus is folded into the champion pick, so champion points reach
  // its value + the bonus only when all four placings were exactly right.
  const champPts = p?.champPts ?? null;
  const hasBonus = champPts != null && champPts >= PLAYOFF_PICK_POINTS.champion + PLAYOFF_PICK_ALL_EXACT_BONUS;

  if (kind === 'groups') {
    if (gTotal === 0 && !keepEmpty) return null;
    return { ...base, totalTips: gTotal, exact: gExact, outcome: gOutcome, wrong: gWrong, pending: gPending, totalPoints: gPoints, playoffPoints: 0, advancing: 0, top4: 0, hasBonus: false };
  }
  if (kind === 'playoff') {
    if (kTotal + pTotal === 0 && !keepEmpty) return null;
    return {
      ...base,
      totalTips: kTotal + pTotal,
      exact: kExact,                       // correct exact 90' scores
      outcome: kAdvance + pCorrect,        // ranking tiebreaker
      wrong: kWrong + pWrong,
      pending: kPending + pPending,
      totalPoints: playoffPoints,
      playoffPoints,
      advancing: kAdvance,                 // correct advancing-team picks
      top4: pCorrect,                      // top-4 picks landing in the top 4
      hasBonus,
    };
  }
  // all
  if (gTotal + kTotal + pTotal === 0 && !keepEmpty) return null;
  return {
    ...base,
    totalTips: gTotal + kTotal + pTotal,
    exact: gExact + kExact,
    outcome: gOutcome + kAdvance + pCorrect,
    wrong: gWrong + kWrong + pWrong,
    pending: gPending + kPending + pPending,
    totalPoints: gPoints + playoffPoints,
    playoffPoints,
    advancing: kAdvance,
    top4: pCorrect,
    hasBonus,
  };
}
