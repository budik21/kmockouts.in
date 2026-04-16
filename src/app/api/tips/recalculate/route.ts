import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import { calculateTipPoints } from '@/lib/tip-scoring';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

/**
 * Recalculate points for all tips on finished matches.
 * Called after admin updates match results. Admin-only.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

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

  // Invalidate the public leaderboard cache so new scores show up immediately.
  revalidateTag(LEADERBOARD_TAG, 'max');

  return NextResponse.json({ updated });
}
