import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { calculateTipPoints } from '@/lib/tip-scoring';

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

  for (const tip of body.tips) {
    if (tip.homeGoals < 0 || tip.awayGoals < 0 || tip.homeGoals > 20 || tip.awayGoals > 20) continue;

    // Check match hasn't started yet
    const match = await queryOne<{ kick_off: string; status: string; home_goals: number | null; away_goals: number | null }>(
      'SELECT kick_off, status, home_goals, away_goals FROM match WHERE id = $1',
      [tip.matchId],
    );
    if (!match) continue;

    const kickOff = new Date(match.kick_off);
    if (kickOff <= new Date() || match.status !== 'SCHEDULED') continue;

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

  return NextResponse.json({ saved });
}
