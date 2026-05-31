import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { recalculateAffectedProbabilities, pregenerateBestThirdSummaries, pregenerateTeamScenarioSummaries, pregenerateAfterGroupClosure, pregenerateThirdPlacedInOtherDecidedGroups } from '@/lib/probability-cache';
import type { GroupId } from '@/lib/types';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { dispatchTipResultEmails } from '@/lib/tip-notifications';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { slugify } from '@/lib/slugify';
import { newMatchUpdateTrace, type MatchUpdateTrace } from '@/lib/match-update-trace';
import { sendAdminMatchSummary } from '@/lib/admin-summary-notification';
import { calculateStandings } from '@/engine/standings';
import { SITE_URL } from '@/lib/seo';

interface UpdateBody {
  matchId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  homeYcRc: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  awayYcRc: number;
  status: string;
}

const MAX_GOALS = 19;
const MAX_CARDS = 11;

/**
 * Hard upper bound on the slow AI-generation stage (scenario summaries,
 * best-third summaries, group article, team articles). The hosting platform
 * has been observed to recycle the container before our cascade finishes when
 * the AI block runs long, which kills the request mid-flight and means the
 * superadmin diagnostic e-mail never goes out. We bound the AI block at 60s
 * and on timeout abandon the in-flight Claude work (each call has its own 30s
 * per-call timeout, so the abandoned promises will resolve on their own),
 * then proceed straight to tip recalc + cache invalidation + e-mail so the
 * admin still gets a partial trace explaining what happened. Total budget
 * (probability recalc + AI ≤ 60s + tip recalc + cache + e-mail) fits well
 * inside the platform's request lifetime.
 */
const AI_PHASE_BUDGET_MS = 60_000;

function isValidGoalCount(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_GOALS);
}

function isValidCardCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CARDS;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body: UpdateBody = await request.json();
    const { matchId, homeGoals, awayGoals, homeYc, homeYc2, homeRcDirect, homeYcRc, awayYc, awayYc2, awayRcDirect, awayYcRc, status } = body;

    if (!matchId || !['SCHEDULED', 'LIVE', 'FINISHED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    if (!isValidGoalCount(homeGoals) || !isValidGoalCount(awayGoals)) {
      return NextResponse.json(
        { error: `Goals must be an integer between 0 and ${MAX_GOALS} (or null)` },
        { status: 400 },
      );
    }

    const cardValues = [homeYc, homeYc2, homeRcDirect, homeYcRc, awayYc, awayYc2, awayRcDirect, awayYcRc];
    if (!cardValues.every(isValidCardCount)) {
      return NextResponse.json(
        { error: `Card counts must be integers between 0 and ${MAX_CARDS}` },
        { status: 400 },
      );
    }

    // Get group_id + team names for the match (names feed the diagnostic e-mail).
    const match = await queryOne<{ group_id: string; home_team_name: string; away_team_name: string }>(
      `SELECT m.group_id, ht.name AS home_team_name, at.name AS away_team_name
       FROM match m
       JOIN team ht ON ht.id = m.home_team_id
       JOIN team at ON at.id = m.away_team_id
       WHERE m.id = $1`,
      [matchId],
    );
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const groupId = match.group_id;
    const cascadeStartedAt = Date.now();
    const trace: MatchUpdateTrace = newMatchUpdateTrace({
      matchId,
      groupId,
      homeTeam: match.home_team_name,
      awayTeam: match.away_team_name,
      homeGoals,
      awayGoals,
      status,
    });

    // Snapshot of the group's match-completion state BEFORE the update.
    // Used after the save + recalc cascade to detect whether THIS update is
    // the one that transitions the group to fully-decided. The cross-group
    // best-third snapshot only locks in for that group at this moment, so
    // every OTHER group's cached articles + 3rd-place team articles need a
    // forced refresh against the fresh snapshot.
    const groupCountsBefore = await queryOne<{ total: number; finished: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'FINISHED')::int AS finished
       FROM match WHERE group_id = $1`,
      [groupId],
    );
    const wasGroupFullyDecidedBefore = groupCountsBefore !== null
      && groupCountsBefore.total > 0
      && groupCountsBefore.finished === groupCountsBefore.total;

    // Update the match
    await query(
      `UPDATE match
       SET home_goals = $1, away_goals = $2,
           home_yc = $3, home_yc2 = $4, home_rc_direct = $5, home_yc_rc = $6,
           away_yc = $7, away_yc2 = $8, away_rc_direct = $9, away_yc_rc = $10,
           status = $11, last_scraped = NOW()
       WHERE id = $12`,
      [homeGoals, awayGoals, homeYc, homeYc2, homeRcDirect, homeYcRc, awayYc, awayYc2, awayRcDirect, awayYcRc, status, matchId],
    );

    // Mark group as recalculating
    await query(
      `INSERT INTO recalc_status (group_id, is_recalculating, started_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (group_id) DO UPDATE SET is_recalculating = true, started_at = NOW()`,
      [groupId],
    );

    // Warmup needs to hit the externally-reachable URL — in production
    // `new URL(request.url).origin` can pick up an internal proxy host like
    // `https://localhost:8080` when the load balancer doesn't rewrite the
    // Host header, and every warmup fetch then fails with TLS errors. Use
    // the canonical SITE_URL in production; in dev fall back to the request
    // origin so localhost still warms its own cache.
    const origin = process.env.NODE_ENV === 'production'
      ? SITE_URL
      : new URL(request.url).origin;

    // Synchronous recalculation chain. We hold the request open until
    // probabilities + AI summaries + AI articles are all rewritten against the
    // freshly-saved match, so that by the time the admin UI gets a `success`
    // response every cached artefact on the site is consistent with the new
    // state.
    //
    // The previous version fired this as a background Promise and returned
    // immediately; the user (and any visitor reloading a team page in the
    // 30–60 s window) would see fresh standings but a STALE AI article — e.g.
    // an "X must beat Y in the final group match" lede for a team whose match
    // against Y had just been entered as finished. Waiting here is the
    // explicit user-stated preference: better to make the admin save take
    // longer than to publish predictions that contradict the standings.
    //
    // Tip e-mail dispatch is the only piece kept fire-and-forget — sending
    // dozens of e-mails should not block the admin response, and a failure
    // in the e-mail provider must not roll back the recalculation.
    try {
      await recalculateAffectedProbabilities(groupId as GroupId);
      console.log(`[admin] Recalculated probabilities for group ${groupId} + best-third`);

      // Snapshot the standings + probability cache so the diagnostic e-mail
      // shows what state the AI generators saw as their input.
      try {
        const teamsForStandings = await query<{
          id: number; name: string; short_name: string; country_code: string; group_id: string;
          is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null;
        }>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
        const matchesForStandings = await query<{
          id: number; group_id: string; round: number;
          home_team_id: number; away_team_id: number;
          home_goals: number | null; away_goals: number | null;
          home_yc: number; home_yc2: number; home_rc_direct: number; home_yc_rc: number;
          away_yc: number; away_yc2: number; away_rc_direct: number; away_yc_rc: number;
          venue: string; kick_off: string; status: string;
        }>(`SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round, kick_off`, [groupId]);

        const standings = calculateStandings({
          teams: teamsForStandings.map(r => ({
            id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
            groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
            externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
          })),
          matches: matchesForStandings.map(r => ({
            id: r.id, groupId: r.group_id as GroupId, round: r.round,
            homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
            homeGoals: r.home_goals, awayGoals: r.away_goals,
            homeYc: r.home_yc, homeYc2: r.home_yc2, homeRcDirect: r.home_rc_direct, homeYcRc: r.home_yc_rc,
            awayYc: r.away_yc, awayYc2: r.away_yc2, awayRcDirect: r.away_rc_direct, awayYcRc: r.away_yc_rc,
            venue: r.venue, kickOff: r.kick_off, status: r.status as 'FINISHED' | 'LIVE' | 'SCHEDULED',
          })),
        });
        trace.standingsAfter = standings.map(s => ({
          position: s.position,
          teamName: s.team.name,
          played: s.matchesPlayed,
          won: s.wins,
          drawn: s.draws,
          lost: s.losses,
          gf: s.goalsFor,
          ga: s.goalsAgainst,
          gd: s.goalDifference,
          points: s.points,
        }));

        const probRows = await query<{
          team_id: number; prob_first: number; prob_second: number; prob_third: number; prob_out: number; prob_third_qual: number;
        }>(
          'SELECT team_id, prob_first, prob_second, prob_third, prob_out, prob_third_qual FROM probability_cache WHERE group_id = $1',
          [groupId],
        );
        const teamNameById = new Map(teamsForStandings.map(t => [t.id, t.name]));
        trace.probabilities = probRows.map(r => ({
          teamName: teamNameById.get(r.team_id) ?? `team ${r.team_id}`,
          pPos1: r.prob_first,
          pPos2: r.prob_second,
          pPos3: r.prob_third,
          pPos4: r.prob_out,
          pThirdQual: r.prob_third_qual,
        }));
      } catch (err) {
        console.error('[admin] Standings snapshot for trace failed:', err);
        trace.errors.push({ step: 'snapshot-standings', message: String(err) });
      }

      // Cross-group best-third snapshot for the diagnostic e-mail. Reflects
      // the DB state AFTER `recalculateAffectedProbabilities` — same view the
      // AI prompts will see in the next step. Errors are swallowed; the
      // snapshot is decorative for the e-mail, not load-bearing.
      try {
        const { buildBestThirdSnapshot } = await import('@/engine/best-third-snapshot');
        const { ALL_GROUPS: ALL_GROUP_IDS } = await import('@/lib/constants');
        const groupInputs: import('@/engine/best-third-snapshot').GroupSnapshotInput[] = [];
        for (const gid of ALL_GROUP_IDS) {
          const tRows = await query<{
            id: number; name: string; short_name: string; country_code: string; group_id: string;
            is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null;
          }>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
          const mRows = await query<{
            id: number; group_id: string; round: number;
            home_team_id: number; away_team_id: number;
            home_goals: number | null; away_goals: number | null;
            home_yc: number; home_yc2: number; home_rc_direct: number; home_yc_rc: number;
            away_yc: number; away_yc2: number; away_rc_direct: number; away_yc_rc: number;
            venue: string; kick_off: string; status: string;
          }>('SELECT * FROM match WHERE group_id = $1', [gid]);
          const allMs = mRows.map(r => ({
            id: r.id, groupId: r.group_id as GroupId, round: r.round,
            homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
            homeGoals: r.home_goals, awayGoals: r.away_goals,
            homeYc: r.home_yc, homeYc2: r.home_yc2, homeRcDirect: r.home_rc_direct, homeYcRc: r.home_yc_rc,
            awayYc: r.away_yc, awayYc2: r.away_yc2, awayRcDirect: r.away_rc_direct, awayYcRc: r.away_yc_rc,
            venue: r.venue, kickOff: r.kick_off, status: r.status as 'FINISHED' | 'LIVE' | 'SCHEDULED',
          }));
          groupInputs.push({
            groupId: gid,
            teams: tRows.map(r => ({
              id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
              groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
              externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
            })),
            playedMatches: allMs.filter(m => m.status === 'FINISHED'),
            totalMatches: allMs.length,
          });
        }
        const snap = buildBestThirdSnapshot(groupInputs);
        trace.bestThirdSnapshot = {
          isFinal: snap.isFinal,
          groupsFullyPlayed: snap.groupsFullyPlayed,
          rows: snap.rows.map(r => ({
            rank: r.rank,
            groupId: r.groupId,
            teamName: r.teamName,
            points: r.points,
            gd: r.goalDifference,
            goalsFor: r.goalsFor,
            goalsAgainst: r.goalsAgainst,
            fairPlayPoints: r.fairPlayPoints,
            fifaRanking: r.fifaRanking,
            groupFullyPlayed: r.groupFullyPlayed,
            snapshotStatus: r.snapshotStatus,
          })),
          tiebreakerNotes: snap.tiebreakerNotes,
        };
      } catch (err) {
        console.error('[admin] Best-third snapshot for trace failed:', err);
        trace.errors.push({ step: 'snapshot-best-third', message: String(err) });
      }

      // Race the AI block against a hard budget. On timeout the abandoned
      // pregenerate promises continue in the background — they cannot block
      // the response, but any team/group articles that DO manage to finish
      // before sendAdminMatchSummary builds the e-mail will still appear in
      // the trace. Each Claude call inside has its own 30s per-call timeout,
      // so no orphan request will live forever.
      const aiPhaseStartedAt = Date.now();
      const aiWork = Promise.allSettled([
        pregenerateTeamScenarioSummaries(groupId as GroupId, { trace }).catch(err => {
          console.error(`[admin] Team scenario AI pregeneration failed for group ${groupId}:`, err);
          trace.errors.push({ step: 'pregenerate-team-scenario-summaries', message: String(err) });
        }),
        pregenerateBestThirdSummaries().catch(err => {
          console.error('[admin] Best-third AI pregeneration failed:', err);
          trace.errors.push({ step: 'pregenerate-best-third-summaries', message: String(err) });
        }),
      ]);
      let aiBudgetTimer: ReturnType<typeof setTimeout> | undefined;
      const aiTimeout = new Promise<'TIMEOUT'>((resolve) => {
        aiBudgetTimer = setTimeout(() => resolve('TIMEOUT'), AI_PHASE_BUDGET_MS);
      });
      const aiOutcome = await Promise.race([
        aiWork.then(() => 'DONE' as const),
        aiTimeout,
      ]);
      if (aiBudgetTimer) clearTimeout(aiBudgetTimer);
      if (aiOutcome === 'TIMEOUT') {
        const elapsed = Date.now() - aiPhaseStartedAt;
        trace.timedOut = {
          stage: 'ai-generation',
          afterMs: elapsed,
          budgetMs: AI_PHASE_BUDGET_MS,
        };
        trace.errors.push({
          step: 'cascade-timeout',
          message: `AI generation exceeded the ${(AI_PHASE_BUDGET_MS / 1000).toFixed(0)}s budget (ran for ${(elapsed / 1000).toFixed(1)}s). In-flight Claude calls were abandoned so the admin response and diagnostic e-mail still go out before the platform recycles the container. Partial trace below — anything missing is what didn't finish in time.`,
        });
        console.error(`[admin] AI phase exceeded ${AI_PHASE_BUDGET_MS}ms — abandoning, proceeding to tip recalc + e-mail`);
      }

      // Did THIS update transition the group from "still open" to "fully
      // decided"? If yes, the cross-group best-third snapshot fed into
      // every other group's articles has just shifted, so we force-regen
      // those. Skipped on edits to an already-decided group (no transition).
      // Budgeted separately so the second phase has its own ~60s window
      // and a slow main cascade doesn't starve it.
      const groupCountsAfter = await queryOne<{ total: number; finished: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'FINISHED')::int AS finished
         FROM match WHERE group_id = $1`,
        [groupId],
      ).catch(() => null);
      const isGroupFullyDecidedNow = groupCountsAfter !== null
        && groupCountsAfter.total > 0
        && groupCountsAfter.finished === groupCountsAfter.total;
      if (isGroupFullyDecidedNow && !wasGroupFullyDecidedBefore) {
        trace.groupClosure = {
          groupId,
          finishedMatches: groupCountsAfter!.finished,
          totalMatches: groupCountsAfter!.total,
        };
        console.log(`[admin] Group ${groupId} just transitioned to fully-decided — triggering cross-group regen`);
        const closureStartedAt = Date.now();
        const closureWork = pregenerateAfterGroupClosure(groupId as GroupId, { trace })
          .catch(err => {
            console.error(`[admin] Cross-group regen failed after closure of group ${groupId}:`, err);
            trace.errors.push({ step: 'pregenerate-after-group-closure', message: String(err) });
          });
        let closureBudgetTimer: ReturnType<typeof setTimeout> | undefined;
        const closureTimeout = new Promise<'TIMEOUT'>((resolve) => {
          closureBudgetTimer = setTimeout(() => resolve('TIMEOUT'), AI_PHASE_BUDGET_MS);
        });
        const closureOutcome = await Promise.race([
          closureWork.then(() => 'DONE' as const),
          closureTimeout,
        ]);
        if (closureBudgetTimer) clearTimeout(closureBudgetTimer);
        if (closureOutcome === 'TIMEOUT') {
          const elapsed = Date.now() - closureStartedAt;
          trace.errors.push({
            step: 'cascade-timeout-closure',
            message: `Cross-group after-closure regen exceeded the ${(AI_PHASE_BUDGET_MS / 1000).toFixed(0)}s budget (ran for ${(elapsed / 1000).toFixed(1)}s). In-flight Claude calls abandoned; some other groups' articles may still reference the pre-closure snapshot.`,
          });
          console.error(`[admin] After-closure regen exceeded ${AI_PHASE_BUDGET_MS}ms — abandoning, proceeding to tip recalc + e-mail`);
        }
      } else {
        // Non-closure path: THIS save did not flip the entered group between
        // open and decided, but it CAN still have shifted the cross-group
        // best-third ranking. Any OTHER group that is already fully-decided
        // holds a 3rd-placed team whose article references the now-stale
        // snapshot, so we force-regen their group + team articles.
        //
        // In-progress OTHER groups are skipped (they would just be wasted
        // Claude calls — their 3rd-placed team is still a moving target and
        // will get a fresh article when a result lands in their group).
        //
        // Bounded by its own AI_PHASE_BUDGET_MS window so a slow run cannot
        // starve tip recalc, cache invalidation or the diagnostic e-mail.
        const snapshotShiftStartedAt = Date.now();
        const snapshotShiftWork = pregenerateThirdPlacedInOtherDecidedGroups(groupId as GroupId, { trace })
          .catch(err => {
            console.error(`[admin] Cross-group 3rd-place regen failed for group ${groupId}:`, err);
            trace.errors.push({ step: 'pregenerate-third-placed-in-other-decided-groups', message: String(err) });
          });
        let snapshotShiftBudgetTimer: ReturnType<typeof setTimeout> | undefined;
        const snapshotShiftTimeout = new Promise<'TIMEOUT'>((resolve) => {
          snapshotShiftBudgetTimer = setTimeout(() => resolve('TIMEOUT'), AI_PHASE_BUDGET_MS);
        });
        const snapshotShiftOutcome = await Promise.race([
          snapshotShiftWork.then(() => 'DONE' as const),
          snapshotShiftTimeout,
        ]);
        if (snapshotShiftBudgetTimer) clearTimeout(snapshotShiftBudgetTimer);
        if (snapshotShiftOutcome === 'TIMEOUT') {
          const elapsed = Date.now() - snapshotShiftStartedAt;
          trace.errors.push({
            step: 'cascade-timeout-snapshot-shift',
            message: `Cross-group 3rd-place regen exceeded the ${(AI_PHASE_BUDGET_MS / 1000).toFixed(0)}s budget (ran for ${(elapsed / 1000).toFixed(1)}s). In-flight Claude calls abandoned; some decided OTHER groups' 3rd-placed team articles may still reference the pre-save snapshot.`,
          });
          console.error(`[admin] Snapshot-shift regen exceeded ${AI_PHASE_BUDGET_MS}ms — abandoning, proceeding to tip recalc + e-mail`);
        }
      }
    } catch (err) {
      console.error(`[admin] Probability recalculation failed for group ${groupId}:`, err);
      trace.errors.push({ step: 'recalculate-probabilities', message: String(err) });
    } finally {
      await query(
        'UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1',
        [groupId],
      ).catch(() => {});
    }

    await query(
      `UPDATE tip_recalc_status SET is_recalculating = true, started_at = NOW() WHERE id = 1`,
    ).catch(() => {});
    try {
      const transitions = await recalculateAllTipPoints();
      console.log(`[admin] Recalculated tip points: ${transitions.length} tips updated`);

      // Enrich transitions with user/match info for the diagnostic e-mail.
      // Only the "first scored" subset (oldPoints null → newPoints set) is
      // what dispatch actually mails out, but the trace shows every change.
      try {
        const tipIds = transitions.map(t => t.tipId);
        if (tipIds.length > 0) {
          const enrichRows = await query<{
            tip_id: number; user_name: string; email: string;
            tip_home_goals: number; tip_away_goals: number;
            home_team_name: string; away_team_name: string;
            home_goals: number | null; away_goals: number | null;
          }>(
            `SELECT t.id AS tip_id, u.name AS user_name, u.email,
                    t.home_goals AS tip_home_goals, t.away_goals AS tip_away_goals,
                    ht.name AS home_team_name, at.name AS away_team_name,
                    m.home_goals, m.away_goals
             FROM tip t
             JOIN tipster_user u ON u.id = t.user_id
             JOIN match m ON m.id = t.match_id
             JOIN team ht ON ht.id = m.home_team_id
             JOIN team at ON at.id = m.away_team_id
             WHERE t.id = ANY($1::int[])`,
            [tipIds],
          );
          const byId = new Map(enrichRows.map(r => [r.tip_id, r]));
          trace.tipTransitions = transitions.map(t => {
            const r = byId.get(t.tipId);
            const matchLabel = r ? `${r.home_team_name} ${r.home_goals ?? '?'}:${r.away_goals ?? '?'} ${r.away_team_name}` : `tip ${t.tipId}`;
            const tipScore = r ? `${r.tip_home_goals}:${r.tip_away_goals}` : '?';
            return {
              tipId: t.tipId,
              userName: r?.user_name ?? '(unknown)',
              userEmail: r?.email ?? '',
              matchLabel,
              tipScore,
              oldPoints: t.oldPoints,
              newPoints: t.newPoints,
            };
          });
        }
      } catch (err) {
        console.error('[admin] Tip transitions enrichment failed:', err);
        trace.errors.push({ step: 'enrich-tip-transitions', message: String(err) });
      }
      trace.tipEmailsQueued = transitions.filter(t => t.oldPoints === null && t.newPoints !== null).length;

      // Tip-result e-mails are dispatched synchronously here (not fire-and-
      // forget) for two reasons: (1) on a platform that recycles the container
      // right after the response, an un-awaited send can be dropped; (2) we
      // want each recipient's outcome (sent / skipped / disabled / failed) in
      // the superadmin diagnostic e-mail, which is built and sent below. The
      // dispatcher swallows individual send failures, so a single bad
      // recipient cannot abort the rest or the cascade.
      try {
        trace.tipEmailDispatch = await dispatchTipResultEmails(transitions);
      } catch (err) {
        console.error('[admin/match/update] email dispatch failed:', err);
        trace.errors.push({ step: 'dispatch-tip-emails', message: String(err) });
      }
    } catch (err) {
      console.error('[admin] Tip recalculation failed:', err);
      trace.errors.push({ step: 'recalculate-tip-points', message: String(err) });
    } finally {
      await query(
        `UPDATE tip_recalc_status
         SET is_recalculating = false, last_completed_at = NOW()
         WHERE id = 1`,
      ).catch(() => {});
    }

    // Purge caches now that every artefact (probability_cache,
    // ai_summary_cache, ai_team_article_cache, ai_group_article_cache,
    // pickem_league_standings, …) reflects the new match. revalidateTag
    // works because we are still inside the original request scope.
    revalidateTag(WC_TAG, 'max');
    revalidateTag(LEADERBOARD_TAG, 'max');
    let cloudflarePurged = true;
    let cloudflareError: string | undefined;
    try {
      await purgeCloudflareCache();
    } catch (err) {
      cloudflarePurged = false;
      cloudflareError = String(err);
      console.error('[admin] Cloudflare cache purge failed:', err);
      trace.errors.push({ step: 'cloudflare-purge', message: String(err) });
    }
    trace.cacheInvalidation = {
      revalidatedTags: [WC_TAG, LEADERBOARD_TAG],
      cloudflarePurged,
      cloudflareError,
    };

    // Send the superadmin diagnostic e-mail synchronously as the final step
    // of the cascade — see comment at top of the try-block. The sender
    // swallows its own errors so a Resend outage cannot break the admin
    // response, but we still want it inside the request scope so the trace
    // captures the cache-invalidation result before being mailed off.
    trace.totalDurationMs = Date.now() - cascadeStartedAt;
    await sendAdminMatchSummary(trace);

    // Warm-up runs after the response so the admin user does not pay for it.
    // No await — fetches against our own origin can outlive this handler.
    (async () => {
      try {
        const groupSlug = `group-${String(groupId).toLowerCase()}`;
        const teamNames = await query<{ name: string }>(
          'SELECT name FROM team WHERE group_id = $1',
          [groupId],
        );
        const urls = [
          `${origin}/`,
          `${origin}/worldcup2026`,
          `${origin}/worldcup2026/${groupSlug}`,
          ...teamNames.map(t => `${origin}/worldcup2026/${groupSlug}/team/${slugify(t.name)}`),
        ];
        await Promise.allSettled(
          urls.map(u =>
            fetch(u, { cache: 'no-store', headers: { 'x-warmup': '1' } }).catch(err => {
              console.error(`[admin] Warm-up fetch failed for ${u}:`, err);
            }),
          ),
        );
        console.log(`[admin] Warmed ${urls.length} URLs for group ${groupId}`);
      } catch (err) {
        console.error('[admin] Cache warm-up failed:', err);
      }
    })();

    return NextResponse.json({ success: true, recalculating: null });
  } catch (error) {
    console.error('POST /api/admin/match/update error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
