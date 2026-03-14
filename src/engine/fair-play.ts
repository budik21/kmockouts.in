/**
 * FIFA Fair Play Points calculation (Article 13).
 *
 * Deductions per team per match:
 *   Yellow card:                   -1
 *   Direct red card:               -4
 *   Yellow + second yellow → red:  -5 (treated as single event, not -1 + -4)
 *
 * NOTE: We track YC and direct RC per team per match in the DB.
 * "Indirect" red (2nd yellow) is implicit: if a player gets YC then 2nd YC→RC,
 * the DB records 1 YC + 0 direct RC for that player, but overall the -5
 * deduction applies. For simplicity in this version, we compute:
 *   fairPlayPoints = (yellowCards * -1) + (directRedCards * -4)
 * A more precise model would need per-player card data.
 */

import {
  FAIR_PLAY_YELLOW_CARD,
  FAIR_PLAY_RED_CARD_DIRECT,
} from '../lib/constants';

export interface FairPlayInput {
  yellowCards: number;
  redCardsDirect: number;
}

/**
 * Calculate fair play points for a team.
 * Returns a negative number (lower = worse discipline).
 */
export function calculateFairPlayPoints(input: FairPlayInput): number {
  return (
    input.yellowCards * FAIR_PLAY_YELLOW_CARD +
    input.redCardsDirect * FAIR_PLAY_RED_CARD_DIRECT
  );
}
