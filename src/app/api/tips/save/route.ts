import { NextRequest, NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { calculateTipPoints } from '@/lib/tip-scoring';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { isTipLocked } from '@/lib/tip-lock';

export const dynamic = 'force-dynamic';

interface SaveTipBody {
  tips: Array<{
    matchId: number;
    homeGoals: number;
    awayGoals: number;
  }>;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body: SaveTipBody = await req.json();
  if (!body.tips || !Array.isArray(body.tips)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let saved = 0;
  // Tips that were dropped because the match locked (within the lead window
  // before kick-off, or no longer SCHEDULED). The client surfaces these as an
  // inline error on the affected match — covers the case where someone had the
  // page open with active steppers and edited a tip after the lock passed.
  const rejected: number[] = [];

  for (const tip of body.tips) {
    if (tip.homeGoals < 0 || tip.awayGoals < 0 || tip.homeGoals > 20 || tip.awayGoals > 20) continue;

    // Check the match is still open for tipping
    const match = await queryOne<{ kick_off: string; status: string; home_goals: number | null; away_goals: number | null }>(
      'SELECT kick_off, status, home_goals, away_goals FROM match WHERE id = $1',
      [tip.matchId],
    );
    if (!match) continue;

    if (isTipLocked(match.kick_off, match.status)) {
      rejected.push(tip.matchId);
      continue;
    }

    await query(
      `INSERT INTO tip (user_id, match_id, home_goals, away_goals, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, match_id) DO UPDATE SET
         home_goals = EXCLUDED.home_goals,
         away_goals = EXCLUDED.away_goals,
         updated_at = EXCLUDED.updated_at`,
      [session.tipsterId, tip.matchId, tip.homeGoals, tip.awayGoals, now],
    );
    saved++;
  }

  // Placing/editing tips changes each league member's total_tips / pending_count,
  // but those live in the materialized pickem_league_standings table. Refresh the
  // standings for every league this user belongs to (which also busts their
  // per-league cache tags), and invalidate the global leaderboard cache so the
  // live count there re-renders. Only when something actually changed.
  if (saved > 0) {
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
