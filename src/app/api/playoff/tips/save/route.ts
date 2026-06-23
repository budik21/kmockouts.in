import { NextRequest, NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { isTipLocked } from '@/lib/tip-lock';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { isFeatureEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

interface SaveBody {
  tips: Array<{
    matchNumber: number;
    homeGoals: number;
    awayGoals: number;
    advanceTeamId: number;
  }>;
}

export async function POST(req: NextRequest) {
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body: SaveBody = await req.json();
  if (!body.tips || !Array.isArray(body.tips)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let saved = 0;
  const rejected: number[] = [];

  for (const tip of body.tips) {
    if (tip.homeGoals < 0 || tip.awayGoals < 0 || tip.homeGoals > 20 || tip.awayGoals > 20) continue;

    const km = await queryOne<{ home_team_id: number | null; away_team_id: number | null; kick_off: string; status: string }>(
      'SELECT home_team_id, away_team_id, kick_off, status FROM knockout_match WHERE match_number = $1',
      [tip.matchNumber],
    );
    if (!km) continue;

    // Both participants must be known, the picked advancing team must be one of
    // them, and the match must still be open for tipping.
    if (km.home_team_id == null || km.away_team_id == null) {
      rejected.push(tip.matchNumber);
      continue;
    }
    if (tip.advanceTeamId !== km.home_team_id && tip.advanceTeamId !== km.away_team_id) {
      rejected.push(tip.matchNumber);
      continue;
    }
    if (isTipLocked(km.kick_off, km.status)) {
      rejected.push(tip.matchNumber);
      continue;
    }

    await query(
      `INSERT INTO knockout_tip (user_id, match_number, home_goals, away_goals, advance_team_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, match_number) DO UPDATE SET
         home_goals = EXCLUDED.home_goals,
         away_goals = EXCLUDED.away_goals,
         advance_team_id = EXCLUDED.advance_team_id,
         updated_at = EXCLUDED.updated_at`,
      [session.tipsterId, tip.matchNumber, tip.homeGoals, tip.awayGoals, tip.advanceTeamId, now],
    );
    saved++;
  }

  if (saved > 0) {
    // Refresh this user's league standings (which now fold in knockout tips)
    // and bust the global leaderboard cache.
    const leagues = await query<{ league_id: number }>(
      'SELECT league_id FROM pickem_league_member WHERE user_id = $1',
      [session.tipsterId],
    );
    for (const { league_id } of leagues) {
      await recalculateLeagueStandings(league_id);
    }
    expireTags(LEADERBOARD_TAG);
  }

  return NextResponse.json({ saved, rejected });
}
