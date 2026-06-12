import { NextRequest, NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { requireAdminApi } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { recalculateAffectedProbabilities, pregenerateTeamScenarioSummaries } from '@/lib/probability-cache';
import type { GroupId } from '@/lib/types';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { enqueueAiJob } from '@/lib/ai-queue';
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

function isValidGoalCount(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_GOALS);
}

function isValidCardCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CARDS;
}

/**
 * FAST LANE.
 *
 * This handler does only the cheap, reliable work and returns quickly:
 *   1. Save the match result.
 *   2. Recalculate probabilities + standings (no AI).
 *   3. Generate the per-position AI scenario summaries (`skipArticles: true`) —
 *      bounded and well under the Anthropic per-minute output-token limit, so
 *      this no longer times out the way the old all-in-one cascade did.
 *   4. Recalculate tip points.
 *   5. Enqueue an AI-generation job; the standalone scraper drains it (SLOW
 *      lane): group + team articles, best-third, cross-group regen, and the
 *      tip-result e-mails (which embed the freshly-generated articles).
 *   6. Invalidate caches (targeted Cloudflare purge of the affected URLs).
 *   7. Send the "fast lane" superadmin diagnostic e-mail.
 *
 * Because a slow job is now pending for the group, the article read paths
 * (getCachedGroupArticle / getCachedTeamArticle) return null until the scraper
 * finishes — so the site shows its "no predictions yet" state (next matches)
 * instead of the stale pre-update article.
 */
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

    // Group + team names for the match (names feed the diagnostic e-mail).
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
    trace.lane = 'fast';

    // Snapshot the group's completion state BEFORE the save, to detect whether
    // THIS update is the one that closes the group out (drives the slow lane's
    // cross-group regen choice).
    const countsBefore = await queryOne<{ total: number; finished: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'FINISHED')::int AS finished
       FROM match WHERE group_id = $1`,
      [groupId],
    );
    const wasFullyDecidedBefore = countsBefore !== null && countsBefore.total > 0 && countsBefore.finished === countsBefore.total;

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

    // Mark group as recalculating (drives the on-site RecalcIndicator).
    await query(
      `INSERT INTO recalc_status (group_id, is_recalculating, started_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (group_id) DO UPDATE SET is_recalculating = true, started_at = NOW()`,
      [groupId],
    );

    // --- Probabilities + scenario summaries (fast lane AI) ---
    try {
      await recalculateAffectedProbabilities(groupId as GroupId);
      console.log(`[admin] Recalculated probabilities for group ${groupId} + best-third`);

      // Snapshot standings + probability cache into the trace so the diagnostic
      // e-mail shows the state the AI scenario generator saw.
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
          position: s.position, teamName: s.team.name, played: s.matchesPlayed,
          won: s.wins, drawn: s.draws, lost: s.losses,
          gf: s.goalsFor, ga: s.goalsAgainst, gd: s.goalDifference, points: s.points,
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
          pPos1: r.prob_first, pPos2: r.prob_second, pPos3: r.prob_third, pPos4: r.prob_out, pThirdQual: r.prob_third_qual,
        }));
      } catch (err) {
        console.error('[admin] Standings snapshot for trace failed:', err);
        trace.errors.push({ step: 'snapshot-standings', message: String(err) });
      }

      // Scenario summaries only — articles are deferred to the slow lane.
      await pregenerateTeamScenarioSummaries(groupId as GroupId, { skipArticles: true, trace });
      console.log(`[admin] Scenario summaries generated for group ${groupId}`);
    } catch (err) {
      console.error(`[admin] Probability/scenario step failed for group ${groupId}:`, err);
      trace.errors.push({ step: 'recalculate-probabilities-scenarios', message: String(err) });
    } finally {
      await query(
        'UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1',
        [groupId],
      ).catch(() => {});
    }

    // --- Tip points recalculation (no e-mails here; the slow lane sends them
    // after the articles exist, so they can embed the fresh article) ---
    await query(
      `UPDATE tip_recalc_status SET is_recalculating = true, started_at = NOW() WHERE id = 1`,
    ).catch(() => {});
    try {
      const transitions = await recalculateAllTipPoints();
      console.log(`[admin] Recalculated tip points: ${transitions.length} tips updated`);

      // Enrich the trace with which tips changed (the slow lane actually mails them).
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
              tipId: t.tipId, userName: r?.user_name ?? '(unknown)', userEmail: r?.email ?? '',
              matchLabel, tipScore, oldPoints: t.oldPoints, newPoints: t.newPoints,
            };
          });
        }
      } catch (err) {
        console.error('[admin] Tip transitions enrichment failed:', err);
        trace.errors.push({ step: 'enrich-tip-transitions', message: String(err) });
      }
      trace.tipEmailsQueued = transitions.filter(t => t.oldPoints === null && t.newPoints !== null).length;
    } catch (err) {
      console.error('[admin] Tip recalculation failed:', err);
      trace.errors.push({ step: 'recalculate-tip-points', message: String(err) });
    } finally {
      await query(
        `UPDATE tip_recalc_status SET is_recalculating = false, last_completed_at = NOW() WHERE id = 1`,
      ).catch(() => {});
    }

    // Did THIS save close the group out (open → fully decided)?
    const countsAfter = await queryOne<{ total: number; finished: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'FINISHED')::int AS finished
       FROM match WHERE group_id = $1`,
      [groupId],
    ).catch(() => null);
    const isFullyDecidedNow = countsAfter !== null && countsAfter.total > 0 && countsAfter.finished === countsAfter.total;
    const justClosed = isFullyDecidedNow && !wasFullyDecidedBefore;

    // Enqueue the slow-lane AI job BEFORE invalidating caches: once a job is
    // pending, the article read paths return null, so the cache rebuilt below
    // captures the "no predictions yet" state instead of the stale article.
    try {
      await enqueueAiJob(groupId, matchId, justClosed);
      console.log(`[admin] Enqueued AI generation job for group ${groupId} (justClosed=${justClosed})`);
    } catch (err) {
      console.error('[admin] Failed to enqueue AI job:', err);
      trace.errors.push({ step: 'enqueue-ai-job', message: String(err) });
    }

    // Invalidate caches: hard-expire the Next.js tags (see cache-expire.ts —
    // the 'max' SWR profile would serve stale data to the first re-render);
    // the Cloudflare purge is targeted to just this group's affected URLs.
    expireTags(WC_TAG, LEADERBOARD_TAG);
    const affectedUrls = await buildAffectedUrls(groupId);
    let cloudflarePurged = true;
    let cloudflareError: string | undefined;
    try {
      await purgeCloudflareCache(affectedUrls);
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

    // Fast-lane superadmin diagnostic e-mail.
    trace.totalDurationMs = Date.now() - cascadeStartedAt;
    await sendAdminMatchSummary(trace);

    return NextResponse.json({ success: true, recalculating: null });
  } catch (error) {
    console.error('POST /api/admin/match/update error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/** Build the absolute URLs whose Cloudflare cache should be purged for a group:
 *  the homepage, the WC overview, the group page, and each team page. */
async function buildAffectedUrls(groupId: string): Promise<string[]> {
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
  return paths.map(p => `${SITE_URL}${p}`);
}
