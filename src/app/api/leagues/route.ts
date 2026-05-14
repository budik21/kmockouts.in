import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { generateUniqueLeagueCode } from '@/lib/league-code-server';
import { createInviteHash } from '@/lib/league-hash';
import { LEAGUE_LIMIT_PER_USER, validateLeagueName } from '@/lib/league-validation';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { LEAGUES_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leagues — create a new league.
 *
 * Body: { name: string }
 * Auth required. Non-admin users are capped at LEAGUE_LIMIT_PER_USER active
 * leagues. The creator is auto-joined as a member.
 *
 * Response 201: { code, name, inviteHash, inviteUrl, leaderboardUrl }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const validation = validateLeagueName(body?.name);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Validate the invite-hash secret up front so we don't insert a row that
  // we can't return an invite link for. Surfaces a clear error rather than
  // a generic 500 if LEAGUE_INVITE_SALT is missing in production.
  let inviteHash: string;
  try {
    inviteHash = createInviteHash('AAAAAA', 'sentinel');
  } catch (e) {
    console.error('[api/leagues] invite-hash secret missing:', e);
    return NextResponse.json(
      { error: 'Server misconfigured: LEAGUE_INVITE_SALT is not set.' },
      { status: 500 },
    );
  }

  try {
    // Per-user creation cap (admins bypass)
    if (!session.isAdmin) {
      const ownedRow = await queryOne<{ cnt: string }>(
        'SELECT COUNT(*)::text AS cnt FROM pickem_league WHERE owner_user_id = $1',
        [session.tipsterId],
      );
      if (parseInt(ownedRow?.cnt ?? '0', 10) >= LEAGUE_LIMIT_PER_USER) {
        return NextResponse.json(
          { error: `You can create at most ${LEAGUE_LIMIT_PER_USER} leagues.` },
          { status: 400 },
        );
      }
    }

    // Case-insensitive name uniqueness check
    const dup = await queryOne<{ id: number }>(
      'SELECT id FROM pickem_league WHERE name_normalized = $1',
      [validation.normalized],
    );
    if (dup) {
      return NextResponse.json({ error: 'A league with this name already exists.' }, { status: 409 });
    }

    const code = await generateUniqueLeagueCode();

    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO pickem_league (code, name, name_normalized, owner_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [code, validation.display, validation.normalized, session.tipsterId],
    );
    if (!inserted) {
      return NextResponse.json({ error: 'Failed to create league.' }, { status: 500 });
    }

    // Auto-join the creator as a member.
    await query(
      `INSERT INTO pickem_league_member (league_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [inserted.id, session.tipsterId],
    );

    await recalculateLeagueStandings(inserted.id);
    revalidateTag(LEAGUES_TAG, 'max');

    inviteHash = createInviteHash(code, validation.display!);
    return NextResponse.json(
      {
        code,
        name: validation.display,
        inviteHash,
        inviteUrl: `/pickem/leagues/invite/${code}/${inviteHash}`,
        leaderboardUrl: `/pickem/leagues/${code}`,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('[api/leagues] create failed:', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create league: ${msg}` },
      { status: 500 },
    );
  }
}
