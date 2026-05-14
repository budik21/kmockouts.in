import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { LEAGUES_TAG, leagueStandingsTag } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ code: string }>;
}

/**
 * DELETE /api/leagues/[code] — delete a league.
 *
 * Owner only. Allowed only when the only remaining member is the owner
 * themselves (i.e. no third-party participants would lose data).
 */
export async function DELETE(_req: Request, ctx: Params) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { code: rawCode } = await ctx.params;
  const code = normalizeLeagueCode(rawCode);
  if (!isValidLeagueCode(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  const league = await queryOne<{ id: number; owner_user_id: number }>(
    'SELECT id, owner_user_id FROM pickem_league WHERE code = $1',
    [code],
  );
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }
  if (league.owner_user_id !== session.tipsterId) {
    return NextResponse.json({ error: 'Only the owner can delete this league' }, { status: 403 });
  }

  // Count members other than the owner. Allow delete only when zero.
  const others = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM pickem_league_member
      WHERE league_id = $1 AND user_id <> $2`,
    [league.id, league.owner_user_id],
  );
  if (parseInt(others?.cnt ?? '0', 10) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a league with other members. Ask them to leave first.' },
      { status: 400 },
    );
  }

  await query('DELETE FROM pickem_league WHERE id = $1', [league.id]);

  revalidateTag(leagueStandingsTag(code), 'max');
  revalidateTag(LEAGUES_TAG, 'max');

  return NextResponse.json({ success: true });
}
