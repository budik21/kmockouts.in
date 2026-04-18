import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';

/**
 * POST /api/admin/pickem/recalculate
 * Recalculate points for all tips based on current match results.
 * ADMIN access required.
 *
 * Uses a single bulk SQL UPDATE (see recalculateAllTipPoints) so this is
 * fast even for thousands of tips. revalidateTag runs inside this request
 * context so the leaderboard cache is purged before the response returns.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const updated = await recalculateAllTipPoints();

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
