import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin-auth';
import { calculateTipPoints } from '@/lib/tip-scoring';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';

/**
 * POST /api/admin/pickem/recalculate
 * Recalculate all tips based on current final match results.
 * ADMIN access required.
 *
 * This action:
 * - Takes all current finished match results
 * - Recalculates points for every tip based on those results
 * - Clears the pick'em leaderboard cache
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const tips = await query<{
      tip_id: number;
      tip_home: number;
      tip_away: number;
      real_home: number | null;
      real_away: number | null;
      match_status: string;
    }>(
      `SELECT t.id as tip_id, t.home_goals as tip_home, t.away_goals as tip_away,
              m.home_goals as real_home, m.away_goals as real_away, m.status as match_status
       FROM tip t
       JOIN match m ON t.match_id = m.id`,
    );

    let updated = 0;
    for (const tip of tips) {
      const points =
        tip.match_status === 'FINISHED'
          ? calculateTipPoints(tip.tip_home, tip.tip_away, tip.real_home, tip.real_away)
          : null;

      await query('UPDATE tip SET points = $1 WHERE id = $2', [points, tip.tip_id]);
      updated++;
    }

    // Invalidate the leaderboard cache so new scores show up immediately
    revalidateTag(LEADERBOARD_TAG, 'max');

    return NextResponse.json({
      success: true,
      message: `Recalculated ${updated} tips based on current match results.`,
      updated,
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/recalculate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
