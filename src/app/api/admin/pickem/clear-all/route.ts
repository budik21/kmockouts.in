import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG, WC_TAG } from '@/lib/cache-tags';

/**
 * POST /api/admin/pickem/clear-all
 * Completely wipe all pick'em results and reset the game.
 * SUPERADMIN ONLY.
 *
 * This action:
 * - Clears all match results (home_goals, away_goals = NULL)
 * - Deletes all tips
 * - Resets all tipster scores (points = 0, all tips gone)
 * - Clears all AI interpretations cache
 * - Clears all pick'em-related caches
 * - Everyone returns to 0 points, but keeps their registered account
 */
export async function POST() {
  const forbidden = await requireSuperadminApi();
  if (forbidden) return forbidden;

  try {
    // 1. Clear all tips (this cascades to delete associated scoring)
    await query('DELETE FROM tip');

    // 2. Clear all match results
    await query('UPDATE match SET home_goals = NULL, away_goals = NULL, status = $1', ['SCHEDULED']);

    // 3. Clear AI interpretation cache
    await query('DELETE FROM ai_summary_cache');

    // 4. Clear probability cache
    await query('DELETE FROM probability_cache');

    // 5. Clear best third cache
    await query('DELETE FROM best_third_cache');

    // 6. Clear qualification threshold cache
    await query('DELETE FROM qualification_threshold_cache');

    // Invalidate all related caches so UI updates immediately
    revalidateTag(LEADERBOARD_TAG, 'max');
    revalidateTag(WC_TAG, 'max');

    return NextResponse.json({
      success: true,
      message: 'All pick\'em results, tips, and caches cleared. Game reset to initial state.',
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/clear-all error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
