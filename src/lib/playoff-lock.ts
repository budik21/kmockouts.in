/**
 * Locking rules for the play-off pick'em.
 *
 * - Per-match knockout tips lock exactly like group-stage tips: TIP_LOCK_LEAD_MS
 *   before that match's kick-off, or once the match is no longer SCHEDULED. They
 *   also require both participants to be known (handled where tips are saved).
 * - The "top-4" winner picks (champion / runner-up / semifinalists) lock once,
 *   exactly at the very first knockout kick-off (21:00 Czech time).
 */
import { ROUND_OF_32, KNOCKOUT_SCHEDULE } from './knockout-bracket';

export { isTipLocked, isTipLastCall, TIP_LOCK_LEAD_MS, TIP_LOCK_LEAD_MINUTES } from './tip-lock';

/**
 * Top-4 picks lock exactly when the first knockout match kicks off — no lead
 * time. Tipsters can keep editing right up to the opening whistle.
 */
export const PLAYOFF_PICKS_LOCK_LEAD_MS = 0;

/**
 * Whether the play-off tipping game is open. The single condition: the whole
 * group stage is decided (caller passes `groupsComplete`). Until then everyone
 * — including signed-in users — sees the landing notice instead of the tipping
 * app. There is no fixed opening time; it goes live the moment the last group
 * match is final.
 */
export function isPlayoffTippingOpen(groupsComplete: boolean): boolean {
  return groupsComplete;
}

/** Kick-off (ms epoch) of the earliest Round-of-32 match, or null if unscheduled. */
export function firstKnockoutKickOffMs(): number | null {
  let earliest: number | null = null;
  for (const def of ROUND_OF_32) {
    const sched = KNOCKOUT_SCHEDULE[def.matchNumber];
    if (!sched?.kickOff) continue;
    const ms = new Date(sched.kickOff).getTime();
    if (Number.isNaN(ms)) continue;
    if (earliest === null || ms < earliest) earliest = ms;
  }
  return earliest;
}

/** The exact moment (ms epoch) the top-4 picks lock, or null if unknown. */
export function playoffPicksLockAtMs(): number | null {
  const first = firstKnockoutKickOffMs();
  return first === null ? null : first - PLAYOFF_PICKS_LOCK_LEAD_MS;
}

/** Whether the top-4 winner picks are locked. */
export function isPlayoffPicksLocked(nowMs: number = Date.now()): boolean {
  const lockAt = playoffPicksLockAtMs();
  if (lockAt === null) return false;
  return nowMs >= lockAt;
}
