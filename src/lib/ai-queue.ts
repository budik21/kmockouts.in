/**
 * AI-generation job queue helpers.
 *
 * A match-update (admin route) handles the FAST lane synchronously — save,
 * recalc standings/tips, generate scenario summaries, invalidate caches — and
 * then enqueues a job here. The standalone scraper process drains the queue
 * (SLOW lane): group + team articles, best-third summaries, cross-group regen,
 * and tip-result e-mails, paced under the Anthropic rate limit and free of the
 * web request's time budget.
 *
 * Backed by the `ai_generation_queue` table (see initializeSchema in db.ts).
 */

import { query, queryOne } from './db';

/** How long a 'processing' row may sit before another drainer may reclaim it
 *  (in case the worker that claimed it crashed mid-job). */
const STALE_PROCESSING_MINUTES = 5;

/** Max attempts before a failing job is parked in 'error' instead of retried.
 *  Each retry only re-calls the API for the items that actually failed (the
 *  successes are content-hash cache hits), so retries are cheap. */
export const MAX_ATTEMPTS = 5;

export interface AiQueueJob {
  id: number;
  groupId: string;
  matchId: number | null;
  attempts: number;
  /** Whether this save just closed the group out (full-decided transition). */
  justClosed: boolean;
}

/**
 * Enqueue a slow-lane AI job for a group. Coalesces: any existing not-yet-done
 * ('pending'/'processing') job for the same group is dropped first, because the
 * slow lane always regenerates against the CURRENT DB state, so an older queued
 * job for the same group is redundant.
 */
export async function enqueueAiJob(groupId: string, matchId: number | null, justClosed = false): Promise<void> {
  await query(
    `DELETE FROM ai_generation_queue WHERE group_id = $1 AND status IN ('pending', 'processing')`,
    [groupId],
  );
  await query(
    `INSERT INTO ai_generation_queue (group_id, match_id, just_closed, status) VALUES ($1, $2, $3, 'pending')`,
    [groupId, matchId, justClosed],
  );
}

/**
 * Atomically claim the next job to process. Picks the oldest 'pending' job, or
 * a 'processing' job whose claim has gone stale (worker crash). Uses
 * FOR UPDATE SKIP LOCKED so concurrent drainers never grab the same row.
 * Returns null when there is nothing to do.
 */
export async function claimNextAiJob(): Promise<AiQueueJob | null> {
  const row = await queryOne<{ id: number; group_id: string; match_id: number | null; attempts: number; just_closed: boolean }>(
    `UPDATE ai_generation_queue
        SET status = 'processing', claimed_at = NOW(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM ai_generation_queue
         WHERE (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
            OR (status = 'processing' AND claimed_at < NOW() - INTERVAL '${STALE_PROCESSING_MINUTES} minutes')
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, group_id, match_id, attempts, just_closed`,
  );
  if (!row) return null;
  return { id: row.id, groupId: row.group_id, matchId: row.match_id, attempts: row.attempts, justClosed: row.just_closed };
}

/** Mark a claimed job as successfully completed. */
export async function markJobDone(id: number): Promise<void> {
  await query(
    `UPDATE ai_generation_queue SET status = 'done', completed_at = NOW(), last_error = NULL WHERE id = $1`,
    [id],
  );
}

/**
 * Record a failed attempt. Returns the job to 'pending' so the next tick retries
 * it, unless it has already used up MAX_ATTEMPTS, in which case it is parked in
 * 'error' for the admin to inspect.
 */
export async function markJobFailed(id: number, attempts: number, message: string): Promise<void> {
  const willRetry = attempts < MAX_ATTEMPTS;
  const finalStatus = willRetry ? 'pending' : 'error';
  // Back off before the next attempt so a failing job doesn't get re-claimed
  // instantly (which would spin and hammer the rate limit). Grows with attempts.
  const backoffSeconds = willRetry ? Math.min(attempts, 6) * 20 : 0;
  await query(
    `UPDATE ai_generation_queue
        SET status = $2, last_error = $3, claimed_at = NULL,
            next_attempt_at = CASE WHEN $2 = 'pending' THEN NOW() + ($4 * INTERVAL '1 second') ELSE next_attempt_at END
      WHERE id = $1`,
    [id, finalStatus, message.slice(0, 2000), backoffSeconds],
  );
}

/**
 * True when a group has an AI job still in flight ('pending' or 'processing').
 * Read paths use this to hide the (now stale) cached articles for that group
 * until the slow lane finishes regenerating them — see getCachedGroupArticle /
 * getCachedTeamArticle.
 */
export async function groupHasPendingAiJob(groupId: string): Promise<boolean> {
  const row = await queryOne<{ one: number }>(
    `SELECT 1 AS one FROM ai_generation_queue
      WHERE group_id = $1 AND status IN ('pending', 'processing') LIMIT 1`,
    [groupId],
  );
  return row !== null;
}
