import { NextRequest, NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { isPlayoffPicksLocked, PLAYOFF_PICKS_LOCK_LEAD_MS } from '@/lib/playoff-lock';
import { PLAYOFF_PICK_SLOTS, PlayoffPickSlot } from '@/lib/playoff-scoring';
import { getPlayoffTeams } from '@/lib/playoff-data';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { isFeatureEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

interface SaveBody {
  picks: Partial<Record<PlayoffPickSlot, number>>;
}

export async function POST(req: NextRequest) {
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (isPlayoffPicksLocked()) {
    return NextResponse.json(
      { error: `Top-4 picks closed ${PLAYOFF_PICKS_LOCK_LEAD_MS / 60000} minutes before the first knockout match` },
      { status: 403 },
    );
  }

  const body: SaveBody = await req.json();
  const picks = body.picks ?? {};

  // All four slots must be filled with valid, distinct, eligible play-off teams.
  const eligible = new Set((await getPlayoffTeams()).map((t) => t.id));
  if (eligible.size === 0) {
    return NextResponse.json({ error: 'The play-off bracket is not set yet' }, { status: 409 });
  }

  const chosen: Array<{ slot: PlayoffPickSlot; teamId: number }> = [];
  for (const slot of PLAYOFF_PICK_SLOTS) {
    const teamId = picks[slot];
    if (!Number.isInteger(teamId)) {
      return NextResponse.json({ error: `Missing pick: ${slot}` }, { status: 400 });
    }
    if (!eligible.has(teamId as number)) {
      return NextResponse.json({ error: `Team not in the play-off (${slot})` }, { status: 400 });
    }
    chosen.push({ slot, teamId: teamId as number });
  }

  const distinct = new Set(chosen.map((c) => c.teamId));
  if (distinct.size !== chosen.length) {
    return NextResponse.json({ error: 'Each team may be picked only once across the four slots' }, { status: 400 });
  }

  const now = new Date().toISOString();
  for (const { slot, teamId } of chosen) {
    await query(
      `INSERT INTO playoff_pick (user_id, slot, team_id, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, slot) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         points = NULL,
         updated_at = EXCLUDED.updated_at`,
      [session.tipsterId, slot, teamId, now],
    );
  }
  // Drop any picks from a previous slot scheme so stale rows can't linger.
  await query(
    `DELETE FROM playoff_pick WHERE user_id = $1 AND slot <> ALL($2::text[])`,
    [session.tipsterId, PLAYOFF_PICK_SLOTS],
  );

  const leagues = await query<{ league_id: number }>(
    'SELECT league_id FROM pickem_league_member WHERE user_id = $1',
    [session.tipsterId],
  );
  for (const { league_id } of leagues) {
    await recalculateLeagueStandings(league_id);
  }
  expireTags(LEADERBOARD_TAG);
  return NextResponse.json({ saved: chosen.length });
}
