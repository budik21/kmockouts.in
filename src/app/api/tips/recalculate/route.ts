import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { dispatchTipResultEmails } from '@/lib/tip-notifications';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

export const dynamic = 'force-dynamic';

/**
 * Recalculate points for all tips on finished matches.
 * Called after admin updates match results. Admin-only.
 *
 * recalculateAllTipPoints() also rebuilds every league's standings and busts
 * the per-league cache tags, so callers don't need to repeat that here.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const transitions = await recalculateAllTipPoints();
  const updated = transitions.length;

  dispatchTipResultEmails(transitions).catch((err) =>
    console.error('[tips/recalculate] email dispatch failed:', err),
  );

  revalidateTag(LEADERBOARD_TAG, 'max');
  await purgeCloudflareCache();

  return NextResponse.json({ updated });
}
