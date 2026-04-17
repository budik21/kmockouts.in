import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG, WC_TAG } from '@/lib/cache-tags';
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
    // 1. Clear all match results
    await query('UPDATE match SET home_goals = NULL, away_goals = NULL, status = $1', ['SCHEDULED']);

    // 2. Clear AI interpretation cache
    await query('DELETE FROM ai_summary_cache');

    // 3. Clear probability cache
    await query('DELETE FROM probability_cache');

    // 4. Clear best third cache
    await query('DELETE FROM best_third_cache');

    // 5. Clear qualification threshold cache
    await query('DELETE FROM qualification_threshold_cache');

    // 6. Recalculate all tips (they'll all be 0 since no results)
    await recalculateAllTipPoints();

    // Invalidate all related caches
    revalidateTag(LEADERBOARD_TAG, 'max');
    revalidateTag(WC_TAG, 'max');

    return NextResponse.json({
      success: true,
      message: 'All match results cleared. Tips recalculated to 0 points.',
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/clear-results error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
