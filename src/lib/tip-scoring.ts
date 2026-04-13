/**
 * Tipovacka scoring logic.
 *
 * - 4 points: exact score match
 * - 1 point:  correct outcome (home win / draw / away win)
 * - 0 points: wrong outcome
 */

export function calculateTipPoints(
  tipHome: number,
  tipAway: number,
  realHome: number | null,
  realAway: number | null,
): number | null {
  if (realHome === null || realAway === null) return null;

  // Exact score
  if (tipHome === realHome && tipAway === realAway) return 4;

  // Correct outcome
  const tipOutcome = Math.sign(tipHome - tipAway);
  const realOutcome = Math.sign(realHome - realAway);
  if (tipOutcome === realOutcome) return 1;

  return 0;
}

export type OutcomeType = 'home' | 'draw' | 'away';

export function getOutcome(home: number, away: number): OutcomeType {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}
