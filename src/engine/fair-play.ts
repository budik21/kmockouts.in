/**
 * FIFA Fair Play Points calculation (Article 13).
 *
 * Deductions per team per match:
 *   Yellow card:                              -1
 *   Indirect red card (two yellow cards):     -3
 *   Direct red card:                          -4
 *   Yellow card + direct red card:            -5
 *
 * Each card type is tracked independently (no cross-deductions).
 */

import {
  FAIR_PLAY_YELLOW_CARD,
  FAIR_PLAY_YELLOW_THEN_RED,
  FAIR_PLAY_RED_CARD_DIRECT,
  FAIR_PLAY_YELLOW_AND_DIRECT_RED,
} from '../lib/constants';

export interface FairPlayInput {
  yellowCards: number;
  secondYellows: number;
  redCardsDirect: number;
  yellowAndDirectRed: number;
}

/**
 * Calculate fair play points for a team.
 * Returns a negative number (lower = worse discipline).
 */
export function calculateFairPlayPoints(input: FairPlayInput): number {
  return (
    input.yellowCards * FAIR_PLAY_YELLOW_CARD +
    input.secondYellows * FAIR_PLAY_YELLOW_THEN_RED +
    input.redCardsDirect * FAIR_PLAY_RED_CARD_DIRECT +
    input.yellowAndDirectRed * FAIR_PLAY_YELLOW_AND_DIRECT_RED
  );
}
