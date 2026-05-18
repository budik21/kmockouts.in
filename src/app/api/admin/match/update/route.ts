import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { recalculateAffectedProbabilities, pregenerateBestThirdSummaries, pregenerateTeamScenarioSummaries } from '@/lib/probability-cache';
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

      await Promise.allSettled([
        pregenerateTeamScenarioSummaries(groupId as GroupId, { trace }).catch(err => {
          console.error(`[admin] Team scenario AI pregeneration failed for group ${groupId}:`, err);
          trace.errors.push({ step: 'pregenerate-team-scenario-summaries', message: String(err) });
        }),
        pregenerateBestThirdSummaries().catch(err => {
          console.error('[admin] Best-third AI pregeneration failed:', err);
          trace.errors.push({ step: 'pregenerate-best-third-summaries', message: String(err) });
        }),
      ]);
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

      // Tip-result e-mails are fire-and-forget so the admin response is not
      // gated on the e-mail provider. The transitions list is already
      // captured, so a slow Resend call cannot lose data.
      dispatchTipResultEmails(transitions).catch((err) =>
        console.error('[admin/match/update] email dispatch failed:', err),
      );
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
