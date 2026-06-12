import { NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { LEADERBOARD_TAG, LEAGUES_TAG } from '@/lib/cache-tags';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/me — permanently delete the signed-in user.
 * Cascade removes:
 *   - tip rows (tip.user_id ON DELETE CASCADE)
 *   - leagues they own (pickem_league.owner_user_id ON DELETE CASCADE)
 *   - membership rows (pickem_league_member.user_id ON DELETE CASCADE)
 *   - standings rows (pickem_league_standings.user_id ON DELETE CASCADE)
 *
 * After cascade, surviving leagues need a standings rebuild so the rank
 * column reflects the now-missing member.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await query('DELETE FROM tipster_user WHERE id = $1', [session.tipsterId]);

  await recalculateLeagueStandings();

  expireTags(LEADERBOARD_TAG, LEAGUES_TAG);
  await purgeCloudflareCache().catch(() => null);

  return NextResponse.json({ success: true });
}
