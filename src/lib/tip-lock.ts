/**
 * Tip locking rules shared by the server (POST /api/tips/save) and the client
 * (TipEditor). Keeping a single source of truth here ensures the UI lock and the
 * server-side guard agree on exactly when a match closes for tipping.
 *
 * Tips close TIP_LOCK_LEAD_MS before kick-off (not at kick-off), giving a small
 * buffer so nobody can tip in the final moments before a match starts.
 */
export const TIP_LOCK_LEAD_MS = 5 * 60 * 1000; // 5 minutes

/** Minutes form of the lead, for user-facing copy. */
export const TIP_LOCK_LEAD_MINUTES = TIP_LOCK_LEAD_MS / 60_000;

/**
 * "Last call" window: tipping is still allowed, but the lock is imminent. Starts
 * TIP_LAST_CALL_LEAD_MS before kick-off and ends when the lock kicks in
 * (TIP_LOCK_LEAD_MS). Purely a UI warning — the server enforces only the lock.
 */
export const TIP_LAST_CALL_LEAD_MS = 7 * 60 * 1000; // 7 minutes

/**
 * Whether tipping is locked for a match. Locked when the match is no longer
 * SCHEDULED, or once we are within TIP_LOCK_LEAD_MS of kick-off.
 *
 * kickOff must be an ISO8601 string carrying an explicit timezone (the DB stores
 * UTC with a trailing `Z`), so `new Date(kickOff)` parses identically on the
 * server (Node, UTC) and in the browser (local TZ). An unparseable value is
 * treated as not locked so a bad row never silently blocks tipping.
 */
export function isTipLocked(kickOff: string, status: string, nowMs: number = Date.now()): boolean {
  if (status !== 'SCHEDULED') return true;
  const kickOffMs = new Date(kickOff).getTime();
  if (Number.isNaN(kickOffMs)) return false;
  return kickOffMs - TIP_LOCK_LEAD_MS <= nowMs;
}

/**
 * Whether the match is in the "last call" window — still editable, but within
 * TIP_LAST_CALL_LEAD_MS of kick-off and not yet locked. Used purely to surface a
 * blinking warning in the UI.
 */
export function isTipLastCall(kickOff: string, status: string, nowMs: number = Date.now()): boolean {
  if (status !== 'SCHEDULED') return false;
  if (isTipLocked(kickOff, status, nowMs)) return false;
  const kickOffMs = new Date(kickOff).getTime();
  if (Number.isNaN(kickOffMs)) return false;
  return kickOffMs - TIP_LAST_CALL_LEAD_MS <= nowMs;
}
