import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const tips = await query<{
    match_id: number;
    home_goals: number;
    away_goals: number;
    points: number | null;
  }>(
    'SELECT match_id, home_goals, away_goals, points FROM tip WHERE user_id = $1',
    [session.tipsterId],
  );

  const tipMap: Record<number, { homeGoals: number; awayGoals: number; points: number | null }> = {};
  for (const t of tips) {
    tipMap[t.match_id] = {
      homeGoals: t.home_goals,
      awayGoals: t.away_goals,
      points: t.points,
    };
  }

  return NextResponse.json({ tips: tipMap });
}
