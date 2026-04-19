import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import {
  recalculateAffectedProbabilities,
  pregenerateBestThirdSummaries,
} from '@/lib/probability-cache';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { ALL_GROUPS } from '@/lib/constants';
import type { GroupId } from '@/lib/types';

/**
 * POST /api/admin/group/recalculate
 * Manual recalculation for a single group. Takes whatever match results
 * currently exist in the DB for the group and:
 *   - Re-enumerates scenarios / runs Monte Carlo → refreshes probability_cache
 *   - Refreshes best-third cache + qualification threshold
 *   - Regenerates AI best-third summaries
 *   - Re-scores all tipster tips (points)
 *   - Purges Next.js Full Route Cache via WC_TAG + LEADERBOARD_TAG
 *
 * Body: { groupId: 'A' | 'B' | ... | 'L' }
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as { groupId?: string };
    const groupId = body.groupId as GroupId | undefined;

    if (!groupId || !ALL_GROUPS.includes(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    // Mark group as recalculating so UI banners can display a progress state.
    await query(
      `INSERT INTO recalc_status (group_id, is_recalculating, started_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (group_id) DO UPDATE SET is_recalculating = true, started_at = NOW()`,
      [groupId],
    ).catch(() => {});

    await query(
      `UPDATE tip_recalc_status SET is_recalculating = true, started_at = NOW() WHERE id = 1`,
    ).catch(() => {});

    const start = Date.now();
    const errors: string[] = [];

    // Probabilities + AI summaries (AI reads the best-third cache the probs write).
    try {
      await recalculateAffectedProbabilities(groupId);
    } catch (err) {
      console.error(`[admin/group/recalculate] probabilities for ${groupId}:`, err);
      errors.push(`probabilities: ${String(err)}`);
    }

    try {
      await pregenerateBestThirdSummaries();
    } catch (err) {
      console.error('[admin/group/recalculate] AI summaries:', err);
      errors.push(`ai-summaries: ${String(err)}`);
    }

    // Re-score all tips against the latest DB state.
    let tipsUpdated = 0;
    try {
      tipsUpdated = await recalculateAllTipPoints();
    } catch (err) {
      console.error('[admin/group/recalculate] tip points:', err);
      errors.push(`tip-points: ${String(err)}`);
    }

    await query(
      'UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1',
      [groupId],
    ).catch(() => {});
    await query(
      `UPDATE tip_recalc_status
       SET is_recalculating = false, last_completed_at = NOW()
       WHERE id = 1`,
    ).catch(() => {});

    // Purge caches within this request context so callers see fresh data.
    revalidateTag(WC_TAG, 'max');
    revalidateTag(LEADERBOARD_TAG, 'max');
    await purgeCloudflareCache();

    const elapsed = Date.now() - start;
    const message =
      errors.length === 0
        ? `Group ${groupId} recalculated in ${elapsed}ms (${tipsUpdated} tips updated)`
        : `Group ${groupId} recalculated with ${errors.length} error(s) in ${elapsed}ms: ${errors.join('; ')}`;

    return NextResponse.json({
      success: errors.length === 0,
      message,
      errors,
      tipsUpdated,
      elapsedMs: elapsed,
    });
  } catch (error) {
    console.error('POST /api/admin/group/recalculate error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
