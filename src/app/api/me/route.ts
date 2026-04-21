import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/me — permanently delete the signed-in user.
 * Cascade removes all their tips (tip.user_id has ON DELETE CASCADE).
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await query('DELETE FROM tipster_user WHERE id = $1', [session.tipsterId]);

  revalidateTag(LEADERBOARD_TAG, 'max');
  await purgeCloudflareCache().catch(() => null);

  return NextResponse.json({ success: true });
}
