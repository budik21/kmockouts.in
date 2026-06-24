/**
 * Locking rules for the play-off pick'em.
 *
 * - Per-match knockout tips lock exactly like group-stage tips: TIP_LOCK_LEAD_MS
 *   before that match's kick-off, or once the match is no longer SCHEDULED. They
 *   also require both participants to be known (handled where tips are saved).
 * - The "top-4" winner picks (champion / runner-up / semifinalists) lock once,
 *   PLAYOFF_PICKS_LOCK_LEAD_MS before the very first knockout kick-off.
 */
import { ROUND_OF_32, KNOCKOUT_SCHEDULE } from './knockout-bracket';

export { isTipLocked, isTipLastCall, TIP_LOCK_LEAD_MS, TIP_LOCK_LEAD_MINUTES } from './tip-lock';

/** Top-4 picks lock 1 hour before the first knockout match kicks off. */
export const PLAYOFF_PICKS_LOCK_LEAD_MS = 60 * 60 * 1000;

/**
 * Announced moment the play-off tipping opens, shown on the landing page until
 * the final group-stage result is in. Stored in UTC; the client renders it in
 * the visitor's own timezone (so e.g. US visitors see it as Sunday evening).
 */
export const PLAYOFF_TIPPING_OPENS_AT = '2026-06-29T04:00:00Z';

/**
 * Whether the play-off tipping game is open. Two conditions must both hold:
 *   1. the whole group stage is decided (caller passes `groupsComplete`), and
 *   2. the announced opening time has arrived.
 * Until then everyone — including signed-in users — sees the landing notice
 * instead of the tipping app.
 */
export function isPlayoffTippingOpen(groupsComplete: boolean, nowMs: number = Date.now()): boolean {
  if (!groupsComplete) return false;
  const opensAt = new Date(PLAYOFF_TIPPING_OPENS_AT).getTime();
  if (Number.isNaN(opensAt)) return true; // misconfigured date → gate on groups only
  return nowMs >= opensAt;
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
