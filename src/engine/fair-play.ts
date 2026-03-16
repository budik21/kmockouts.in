/**
 * FIFA Fair Play Points calculation (Article 13).
 *
 * Deductions per team per match:
 *   Yellow card:                   -1
 *   Direct red card:               -4
 *   Yellow + second yellow → red:  -5 (treated as single event, not -1 + -4)
 *
 * We track:
 *   yellowCards    = total YC given (including first yellows of 2YC incidents)
 *   secondYellows  = number of second-yellow-red incidents
 *   redCardsDirect = direct red cards
 *
 * Standalone yellows = yellowCards - secondYellows
 * Fair play = standalone * -1 + secondYellows * -5 + directReds * -4
 */

import {
  FAIR_PLAY_YELLOW_CARD,
  FAIR_PLAY_RED_CARD_DIRECT,
  FAIR_PLAY_YELLOW_THEN_RED,
} from '../lib/constants';

export interface FairPlayInput {
  yellowCards: number;
  secondYellows: number;
  redCardsDirect: number;
}

/**
 * Calculate fair play points for a team.
 * Returns a negative number (lower = worse discipline).
 */
export function calculateFairPlayPoints(input: FairPlayInput): number {
  const standaloneYellows = input.yellowCards - input.secondYellows;
  return (
    standaloneYellows * FAIR_PLAY_YELLOW_CARD +
    input.secondYellows * FAIR_PLAY_YELLOW_THEN_RED +
    input.redCardsDirect * FAIR_PLAY_RED_CARD_DIRECT
  );
}
