/**
 * Play-off (knockout) pick'em scoring rules. Single source of truth shared by
 * the SQL recalc, the admin result flow and the UI copy.
 *
 * Per knockout match (independent, max 13):
 *   - 8 points: exact 90' score (regulation full-time)
 *   - 5 points: correct advancing team
 *
 * Top-4 placement picks (one set per user, four distinct teams). The
 * third-place match decides 3rd vs 4th, so all four final placings are named:
 *   - 40 points: 1st place / champion (winner of the final)
 *   - 20 points: 2nd place (loser of the final)
 *   - 20 points: 3rd place (winner of the third-place match)
 *   - 20 points: 4th place (loser of the third-place match)
 *   - 10 points: a picked team that finishes in the top 4 but at another place
 *   - +50 BONUS: all four placings named exactly right
 */

export const KO_EXACT_POINTS = 8;
export const KO_ADVANCE_POINTS = 5;

export type PlayoffPickSlot = 'champion' | 'runner_up' | 'third' | 'fourth';

export const PLAYOFF_PICK_SLOTS: PlayoffPickSlot[] = [
  'champion',
  'runner_up',
  'third',
  'fourth',
];

export const PLAYOFF_PICK_POINTS: Record<PlayoffPickSlot, number> = {
  champion: 40,
  runner_up: 20,
  third: 20,
  fourth: 20,
};

export const PLAYOFF_PICK_LABELS: Record<PlayoffPickSlot, string> = {
  champion: '1st place — Champion',
  runner_up: '2nd place',
  third: '3rd place',
  fourth: '4th place',
};

/** A picked team that finishes in the top 4 but at a different placing. */
export const PLAYOFF_PICK_WRONG_PLACE_POINTS = 10;

/** Bonus added when all four placings are named exactly right. */
export const PLAYOFF_PICK_ALL_EXACT_BONUS = 50;

/** Raw result columns of a knockout match (regulation 90', extra time, penalties). */
export interface KnockoutResult {
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeGoals: number | null;     // after 90'
  awayGoals: number | null;
  homeGoalsEt: number | null;   // full score at end of ET (incl. 90')
  awayGoalsEt: number | null;
  homePens: number | null;
  awayPens: number | null;
}

/**
 * Determine the advancing team from a knockout result. Resolution order:
 * penalties → extra time → 90 minutes. Returns null when the deepest provided
 * level is still level (i.e. not decided yet) or participants are unknown.
 */
export function computeAdvancing(r: KnockoutResult): number | null {
  if (r.homeTeamId == null || r.awayTeamId == null) return null;

  if (r.homePens != null && r.awayPens != null) {
    if (r.homePens === r.awayPens) return null; // shoot-outs cannot end level
    return r.homePens > r.awayPens ? r.homeTeamId : r.awayTeamId;
  }

  if (r.homeGoalsEt != null && r.awayGoalsEt != null) {
    if (r.homeGoalsEt === r.awayGoalsEt) return null; // level after ET → needs pens
    return r.homeGoalsEt > r.awayGoalsEt ? r.homeTeamId : r.awayTeamId;
  }

  if (r.homeGoals != null && r.awayGoals != null) {
    if (r.homeGoals === r.awayGoals) return null; // level after 90' → needs ET/pens
    return r.homeGoals > r.awayGoals ? r.homeTeamId : r.awayTeamId;
  }

  return null;
}

/** Points for a single knockout match tip given the (finished) actual result. */
export function knockoutTipPoints(
  tipHome: number,
  tipAway: number,
  tipAdvanceTeamId: number,
  actualHome: number | null,
  actualAway: number | null,
  advancingTeamId: number | null,
): number | null {
  if (advancingTeamId == null) return null; // match not decided yet
  let pts = 0;
  if (actualHome != null && actualAway != null && tipHome === actualHome && tipAway === actualAway) {
    pts += KO_EXACT_POINTS;
  }
  if (tipAdvanceTeamId === advancingTeamId) {
    pts += KO_ADVANCE_POINTS;
  }
  return pts;
}
