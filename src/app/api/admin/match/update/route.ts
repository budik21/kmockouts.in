import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { recalculateGroupProbabilities } from '@/lib/probability-cache';
import type { GroupId } from '@/lib/types';

interface UpdateBody {
  matchId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  status: string;
}

export async function POST(request: NextRequest) {
  // Auth check (skip in development)
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (googleConfigured && !isDev) {
    const session = await auth();
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body: UpdateBody = await request.json();
    const { matchId, homeGoals, awayGoals, homeYc, homeYc2, homeRcDirect, awayYc, awayYc2, awayRcDirect, status } = body;

    if (!matchId || !['SCHEDULED', 'LIVE', 'FINISHED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Get group_id for the match
    const match = await queryOne<{ group_id: string }>('SELECT group_id FROM match WHERE id = $1', [matchId]);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const groupId = match.group_id;

    // Update the match
    await query(
      `UPDATE match
       SET home_goals = $1, away_goals = $2,
           home_yc = $3, home_yc2 = $4, home_rc_direct = $5,
           away_yc = $6, away_yc2 = $7, away_rc_direct = $8,
           status = $9, last_scraped = NOW()
       WHERE id = $10`,
      [homeGoals, awayGoals, homeYc, homeYc2, homeRcDirect, awayYc, awayYc2, awayRcDirect, status, matchId],
    );

    // Mark group as recalculating
    await query(
      `INSERT INTO recalc_status (group_id, is_recalculating, started_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (group_id) DO UPDATE SET is_recalculating = true, started_at = NOW()`,
      [groupId],
    );

    // Fire recalculation asynchronously
    recalculateGroupProbabilities(groupId as GroupId)
      .then(async () => {
        await query('UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1', [groupId]);
        console.log(`[admin] Recalculated group ${groupId}`);
      })
      .catch(async (err) => {
        console.error(`[admin] Recalculation failed for group ${groupId}:`, err);
        await query('UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1', [groupId]).catch(() => {});
      });

    return NextResponse.json({ success: true, recalculating: groupId });
  } catch (error) {
    console.error('POST /api/admin/match/update error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
