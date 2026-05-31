/**
 * Slow-lane AI-generation drainer.
 *
 * Runs inside the standalone scraper process (see index.ts). The web app's
 * match-update route handles the fast lane (save + standings + tips + scenario
 * summaries) and enqueues a job into `ai_generation_queue`. This drainer picks
 * up those jobs and does the heavy, rate-limit-bound work — group + team
 * articles, best-third summaries, cross-group regen — paced and free of any
 * request time budget, then sends the tip-result e-mails (now embedding the
 * fresh articles) and invalidates the relevant caches.
 */

import { query, queryOne } from '../lib/db';
import {
  claimNextAiJob,
  markJobDone,
  markJobFailed,
  MAX_ATTEMPTS,
  type AiQueueJob,
} from '../lib/ai-queue';
import {
  pregenerateTeamScenarioSummaries,
  pregenerateBestThirdSummaries,
  pregenerateAfterGroupClosure,
  pregenerateThirdPlacedInOtherDecidedGroups,
} from '../lib/probability-cache';
import { dispatchTipResultEmailsForMatch } from '../lib/tip-notifications';
import { newMatchUpdateTrace, type MatchUpdateTrace } from '../lib/match-update-trace';
import { sendAdminMatchSummary } from '../lib/admin-summary-notification';
import { slugify } from '../lib/slugify';
import { SITE_URL } from '../lib/seo';
import type { GroupId } from '../lib/types';

/** Guard against overlapping runs if a job outlives the cron interval. */
let isDraining = false;

/**
 * Drain the AI-generation queue: process pending jobs back-to-back until the
 * queue is empty. Safe to call on a short interval — overlapping invocations
 * are skipped via the in-process guard, and job claiming uses row locks so even
 * a second process could not double-process a job.
 */
export async function drainAiQueue(): Promise<void> {
  if (isDraining) {
    console.log('[ai-drainer] already running — skipping this tick');
    return;
  }
  isDraining = true;
  try {
    // Process the whole backlog in one invocation. Bounded loop so a flood of
    // jobs can't keep us here forever.
    for (let i = 0; i < 20; i++) {
      const job = await claimNextAiJob();
      if (!job) break;
      await processJob(job);
    }
  } catch (err) {
    console.error('[ai-drainer] unexpected error:', err);
  } finally {
    isDraining = false;
  }
}

async function processJob(job: AiQueueJob): Promise<void> {
  const startedAt = Date.now();
  console.log(`[ai-drainer] processing job #${job.id} group=${job.groupId} match=${job.matchId} justClosed=${job.justClosed} attempt=${job.attempts}`);

  // Build a diagnostic trace for the slow-lane summary e-mail.
  const matchInfo = job.matchId !== null
    ? await queryOne<{
        group_id: string; status: string; home_goals: number | null; away_goals: number | null;
        home_team_name: string; away_team_name: string;
      }>(
        `SELECT m.group_id, m.status, m.home_goals, m.away_goals,
                ht.name AS home_team_name, at.name AS away_team_name
         FROM match m
         JOIN team ht ON ht.id = m.home_team_id
         JOIN team at ON at.id = m.away_team_id
         WHERE m.id = $1`,
        [job.matchId],
      ).catch(() => null)
    : null;

  const trace: MatchUpdateTrace = newMatchUpdateTrace({
    matchId: job.matchId ?? 0,
    groupId: job.groupId,
    homeTeam: matchInfo?.home_team_name ?? '?',
    awayTeam: matchInfo?.away_team_name ?? '?',
    homeGoals: matchInfo?.home_goals ?? null,
    awayGoals: matchInfo?.away_goals ?? null,
    status: matchInfo?.status ?? 'FINISHED',
  });
  trace.lane = 'slow';

  try {
    // 1. Group + team articles for the entered group. Scenario summaries were
    //    already generated + cached by the fast lane, so the scenario step here
    //    is cache hits (no API calls); only the articles are generated.
    await pregenerateTeamScenarioSummaries(job.groupId as GroupId, { trace });

    // 2. Best-third summaries (own precondition gate inside).
    await pregenerateBestThirdSummaries().catch(err => {
      console.error('[ai-drainer] best-third summaries failed:', err);
      trace.errors.push({ step: 'pregenerate-best-third-summaries', message: String(err) });
    });

    // 3. Cross-group regen: closing a group flips the best-third snapshot's
    //    isFinal/ranking for everyone, so broaden the regen on a close.
    if (job.justClosed) {
      trace.groupClosure = { groupId: job.groupId, finishedMatches: 0, totalMatches: 0 };
      await pregenerateAfterGroupClosure(job.groupId as GroupId, { trace }).catch(err => {
        console.error('[ai-drainer] after-closure regen failed:', err);
        trace.errors.push({ step: 'pregenerate-after-group-closure', message: String(err) });
      });
    } else {
      await pregenerateThirdPlacedInOtherDecidedGroups(job.groupId as GroupId, { trace }).catch(err => {
        console.error('[ai-drainer] cross-group 3rd-place regen failed:', err);
        trace.errors.push({ step: 'pregenerate-third-placed-in-other-decided-groups', message: String(err) });
      });
    }

    // Snapshot the generation outcome BEFORE e-mails/revalidate add their own
    // errors, so the pass summary reflects only the generation work.
    const genErrorCount = trace.errors.length;
    const articleTraces = [...(trace.groupArticle ? [trace.groupArticle] : []), ...trace.teamArticles];
    const okCount = articleTraces.filter(a => a.output).length;
    const genFailed = genErrorCount > 0;
    const willRetry = genFailed && job.attempts < MAX_ATTEMPTS;
    // Mirror the backoff computed in markJobFailed so the e-mail can show it.
    const backoffSeconds = Math.min(job.attempts, 6) * 20;

    trace.slowPass = {
      attempt: job.attempts,
      maxAttempts: MAX_ATTEMPTS,
      succeeded: !genFailed,
      gaveUp: genFailed && !willRetry,
      okCount,
      failedCount: genErrorCount,
      nextAttemptInSeconds: willRetry ? backoffSeconds : undefined,
    };

    if (willRetry) {
      // Re-queue with backoff. The group stays pending (pages keep the "no
      // predictions yet" state); no tip e-mails / cache revalidation on a retry.
      await markJobFailed(job.id, job.attempts, `partial generation failure (${genErrorCount} error(s)) — retrying`);
      console.log(`[ai-drainer] job #${job.id} partial failure (${genErrorCount} errors), re-queued — attempt ${job.attempts}/${MAX_ATTEMPTS}, retry in ${backoffSeconds}s`);
    } else {
      // Success, or attempts exhausted → finalize.
      // Tip-result e-mails for the match — articles now exist, so they embed the
      // fresh headline/lede. Idempotent via tip.notified_at.
      if (job.matchId !== null) {
        try {
          trace.tipEmailDispatch = await dispatchTipResultEmailsForMatch(job.matchId);
        } catch (err) {
          console.error('[ai-drainer] tip e-mail dispatch failed:', err);
          trace.errors.push({ step: 'dispatch-tip-emails', message: String(err) });
        }
      }

      // Invalidate caches via the internal endpoint.
      await revalidateGroup(job.groupId, trace);

      if (genFailed) {
        await markJobFailed(job.id, job.attempts, `gave up after ${job.attempts} attempts with ${genErrorCount} error(s)`);
        console.log(`[ai-drainer] job #${job.id} GAVE UP after ${job.attempts} attempts in ${Date.now() - startedAt}ms`);
      } else {
        await markJobDone(job.id);
        console.log(`[ai-drainer] job #${job.id} done in ${Date.now() - startedAt}ms`);
      }
    }
  } catch (err) {
    console.error(`[ai-drainer] job #${job.id} failed:`, err);
    trace.errors.push({ step: 'process-job', message: String(err) });
    await markJobFailed(job.id, job.attempts, String(err)).catch(() => {});
    // Ensure the e-mail still gets a pass summary on a hard failure.
    trace.slowPass = trace.slowPass ?? {
      attempt: job.attempts,
      maxAttempts: MAX_ATTEMPTS,
      succeeded: false,
      gaveUp: job.attempts >= MAX_ATTEMPTS,
      okCount: 0,
      failedCount: trace.errors.length,
      nextAttemptInSeconds: job.attempts < MAX_ATTEMPTS ? Math.min(job.attempts, 6) * 20 : undefined,
    };
  }

  // Slow-lane diagnostic e-mail — sent on EVERY pass (including each retry).
  trace.totalDurationMs = Date.now() - startedAt;
  await sendAdminMatchSummary(trace).catch(err =>
    console.error('[ai-drainer] diagnostic e-mail failed:', err),
  );
}

/**
 * Tell the web server to drop the stale caches for a group's pages. The scraper
 * cannot call Next's revalidateTag directly (different process), so it POSTs the
 * affected paths to the internal endpoint, which revalidates the tags and does a
 * TARGETED Cloudflare purge of just those URLs.
 */
async function revalidateGroup(groupId: string, trace: MatchUpdateTrace): Promise<void> {
  const groupSlug = `group-${String(groupId).toLowerCase()}`;
  const teamNames = await query<{ name: string }>(
    'SELECT name FROM team WHERE group_id = $1',
    [groupId],
  ).catch(() => [] as { name: string }[]);
  const paths = [
    '/',
    '/worldcup2026',
    `/worldcup2026/${groupSlug}`,
    ...teamNames.map(t => `/worldcup2026/${groupSlug}/team/${slugify(t.name)}`),
  ];

  const secret = process.env.AUTH_SECRET;
  let ok = false;
  let error: string | undefined;
  if (!secret) {
    error = 'AUTH_SECRET missing in scraper env — cannot call internal revalidate';
    console.error(`[ai-drainer] ${error}`);
  } else {
    try {
      const res = await fetch(`${SITE_URL}/api/internal/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ paths }),
      });
      ok = res.ok;
      if (!res.ok) error = `revalidate endpoint returned ${res.status}`;
    } catch (err) {
      error = String(err);
      console.error('[ai-drainer] revalidate call failed:', err);
    }
  }

  trace.cacheInvalidation = {
    revalidatedTags: ok ? ['wc-data', 'predictions-leaderboard'] : [],
    cloudflarePurged: ok,
    cloudflareError: error,
  };
  if (error) trace.errors.push({ step: 'revalidate', message: error });
}
