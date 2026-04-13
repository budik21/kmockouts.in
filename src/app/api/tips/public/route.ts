import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const user = await queryOne<{ id: number; name: string; tips_public: boolean }>(
    'SELECT id, name, tips_public FROM tipster_user WHERE share_token = $1',
    [token],
  );

  if (!user || !user.tips_public) {
    return NextResponse.json({ error: 'Not found or private' }, { status: 404 });
  }

  const tips = await query<{
    match_id: number;
    home_goals: number;
    away_goals: number;
    points: number | null;
  }>(
    'SELECT match_id, home_goals, away_goals, points FROM tip WHERE user_id = $1',
    [user.id],
  );

  const tipMap: Record<number, { homeGoals: number; awayGoals: number; points: number | null }> = {};
  for (const t of tips) {
    tipMap[t.match_id] = {
      homeGoals: t.home_goals,
      awayGoals: t.away_goals,
      points: t.points,
    };
  }

  return NextResponse.json({ userName: user.name, tips: tipMap });
}
