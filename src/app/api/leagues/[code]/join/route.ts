import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { isValidInviteHashFormat, verifyInviteHash } from '@/lib/league-hash';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { sendLeagueWelcomeIfFirstJoin } from '@/lib/league-welcome';
import { LEAGUES_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ code: string }>;
}

/**
 * POST /api/leagues/[code]/join — join a league via the invite landing page.
 *
 * Body: { hash: string } — must be a valid HMAC for (code, league.name).
 * Auth required. Idempotent: re-joining is a no-op (returns alreadyMember=true).
 */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { code: rawCode } = await ctx.params;
  const code = normalizeLeagueCode(rawCode);
  if (!isValidLeagueCode(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const hash = typeof body?.hash === 'string' ? body.hash : '';
  if (!isValidInviteHashFormat(hash)) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 400 });
  }

  const league = await queryOne<{ id: number; name: string }>(
    'SELECT id, name FROM pickem_league WHERE code = $1',
    [code],
  );
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  if (!verifyInviteHash(code, league.name, hash)) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 403 });
  }

  const existing = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM pickem_league_member WHERE league_id = $1 AND user_id = $2',
    [league.id, session.tipsterId],
  );
  if (existing) {
    return NextResponse.json({ success: true, alreadyMember: true });
  }

  await query(
    'INSERT INTO pickem_league_member (league_id, user_id) VALUES ($1, $2)',
    [league.id, session.tipsterId],
  );

  await recalculateLeagueStandings(league.id);
  revalidateTag(LEAGUES_TAG, 'max');

  await sendLeagueWelcomeIfFirstJoin(session.tipsterId);

  return NextResponse.json({ success: true, alreadyMember: false });
}
