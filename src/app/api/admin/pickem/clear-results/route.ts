import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG, WC_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';

/**
 * POST /api/admin/pickem/clear-results
 * Clear all match results and recalculate tips to 0 points.
 * SUPERADMIN ONLY.
 *
 * This action:
 * - Clears all match results (scores reset to NULL)
 * - Deletes all AI interpretations cache
 * - Clears all probability caches
 * - Recalculates all tips to 0 points (since no results to score against)
 * - Clears caches so UI updates
 * - Tipster accounts and tips remain intact
 */
export async function POST() {
  const forbidden = await requireSuperadminApi();
  if (forbidden) return forbidden;

  try {
    // 1. Clear all match results and cards
    await query(
      `UPDATE match
       SET home_goals = NULL, away_goals = NULL, status = $1,
           home_yc = 0, home_yc2 = 0, home_rc_direct = 0, home_yc_rc = 0,
           away_yc = 0, away_yc2 = 0, away_rc_direct = 0, away_yc_rc = 0`,
      ['SCHEDULED'],
    );

    // 2. Clear all AI prediction caches: the granular per-team/per-position
    //    scenario summaries plus the synthesized group and team articles. All
    //    three are result-derived; without this they survive as stale
    //    predictions describing results that no longer exist.
    await query('DELETE FROM ai_summary_cache');
    await query('DELETE FROM ai_group_article_cache');
    await query('DELETE FROM ai_team_article_cache');

    // 3. Clear probability cache
    await query('DELETE FROM probability_cache');

    // 4. Clear best third cache
    await query('DELETE FROM best_third_cache');

    // 5. Clear qualification threshold cache
    await query('DELETE FROM qualification_threshold_cache');

    // 6. Recalculate all tips (their points reset to NULL since no results)
    await recalculateAllTipPoints();

    // 7. Re-arm tip-result e-mail notifications. Clearing the tournament must
    //    wipe ALL tip evaluation — points AND the notified_at marker — so that
    //    re-entering a result later sends the notification again instead of
    //    being silently suppressed (notified_at still set from a prior run).
    await query('UPDATE tip SET points = NULL, notified_at = NULL');

    // Drain any queued/in-flight AI generation jobs — they reference the now
    // wiped results and their tip e-mails were just re-armed.
    await query(`DELETE FROM ai_generation_queue WHERE status IN ('pending', 'processing')`);

    // Invalidate all related caches
    revalidateTag(LEADERBOARD_TAG, 'max');
    revalidateTag(WC_TAG, 'max');
    await purgeCloudflareCache();

    return NextResponse.json({
      success: true,
      message: 'All match results cleared. Tips recalculated to 0 points.',
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/clear-results error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
