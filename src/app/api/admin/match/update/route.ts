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

    // Get group_id for the match
    const match = await queryOne<{ group_id: string }>('SELECT group_id FROM match WHERE id = $1', [matchId]);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const groupId = match.group_id;

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

    const origin = new URL(request.url).origin;

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

      await Promise.allSettled([
        pregenerateTeamScenarioSummaries(groupId as GroupId).catch(err => {
          console.error(`[admin] Team scenario AI pregeneration failed for group ${groupId}:`, err);
        }),
        pregenerateBestThirdSummaries().catch(err => {
          console.error('[admin] Best-third AI pregeneration failed:', err);
        }),
      ]);
    } catch (err) {
      console.error(`[admin] Probability recalculation failed for group ${groupId}:`, err);
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
      // Tip-result e-mails are fire-and-forget so the admin response is not
      // gated on the e-mail provider. The transitions list is already
      // captured, so a slow Resend call cannot lose data.
      dispatchTipResultEmails(transitions).catch((err) =>
        console.error('[admin/match/update] email dispatch failed:', err),
      );
    } catch (err) {
      console.error('[admin] Tip recalculation failed:', err);
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
    await purgeCloudflareCache();

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
