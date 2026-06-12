import { NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { LEAGUES_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ code: string }>;
}

/**
 * POST /api/leagues/[code]/leave — leave a league.
 *
 * Auth required. The owner is allowed to leave too — the league row stays
 * (so the owner can still administer it from the Leagues tab), they just won't
 * appear in its standings.
 */
export async function POST(_req: Request, ctx: Params) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { code: rawCode } = await ctx.params;
  const code = normalizeLeagueCode(rawCode);
  if (!isValidLeagueCode(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  const league = await queryOne<{ id: number }>(
    'SELECT id FROM pickem_league WHERE code = $1',
    [code],
  );
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  await query(
    'DELETE FROM pickem_league_member WHERE league_id = $1 AND user_id = $2',
    [league.id, session.tipsterId],
  );

  await recalculateLeagueStandings(league.id);
  expireTags(LEAGUES_TAG);

  return NextResponse.json({ success: true });
}
