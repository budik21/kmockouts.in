import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { LEAGUES_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues/entry — join a league by typing its 6-char code.
 *
 * Body: { code: string }
 *
 * Unlike /join (used by the invite landing page), this endpoint requires no
 * hash — the code itself is the access ticket. Used by the "Entry to
 * League" modal in /me/leagues.
 *
 * Returns 200 with `alreadyMember` flag, 404 with "Wrong code" message on
 * unknown codes (deliberately uniform "Wrong" error so we don't confirm
 * code existence via the response).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawCode = typeof body?.code === 'string' ? body.code : '';
  const code = normalizeLeagueCode(rawCode);
  if (!isValidLeagueCode(code)) {
    return NextResponse.json({ error: 'Wrong code.' }, { status: 400 });
  }

  const league = await queryOne<{ id: number; name: string }>(
    'SELECT id, name FROM pickem_league WHERE code = $1',
    [code],
  );
  if (!league) {
    return NextResponse.json({ error: 'Wrong code.' }, { status: 404 });
  }

  const existing = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM pickem_league_member WHERE league_id = $1 AND user_id = $2',
    [league.id, session.tipsterId],
  );
  if (existing) {
    return NextResponse.json({
      success: true,
      alreadyMember: true,
      code,
      name: league.name,
    });
  }

  await query(
    'INSERT INTO pickem_league_member (league_id, user_id) VALUES ($1, $2)',
    [league.id, session.tipsterId],
  );

  await recalculateLeagueStandings(league.id);
  revalidateTag(LEAGUES_TAG, 'max');

  return NextResponse.json({
    success: true,
    alreadyMember: false,
    code,
    name: league.name,
  });
}
