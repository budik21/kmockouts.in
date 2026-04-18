import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

/**
 * Recalculate points for all tips on finished matches.
 * Called after admin updates match results. Admin-only.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const updated = await recalculateAllTipPoints();

  revalidateTag(LEADERBOARD_TAG, 'max');

  return NextResponse.json({ updated });
}
