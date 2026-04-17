import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { recalculateAllProbabilities, pregenerateBestThirdSummaries } from '@/lib/probability-cache';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';

interface UpdateBody {
  matchId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  homeYcRc: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  awayYcRc: number;
  status: string;
}

const MAX_GOALS = 19;
const MAX_CARDS = 11;

function isValidGoalCount(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_GOALS);
}

function isValidCardCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CARDS;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body: UpdateBody = await request.json();
    const { matchId, homeGoals, awayGoals, homeYc, homeYc2, homeRcDirect, homeYcRc, awayYc, awayYc2, awayRcDirect, awayYcRc, status } = body;

    if (!matchId || !['SCHEDULED', 'LIVE', 'FINISHED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    if (!isValidGoalCount(homeGoals) || !isValidGoalCount(awayGoals)) {
      return NextResponse.json(
        { error: `Goals must be an integer between 0 and ${MAX_GOALS} (or null)` },
        { status: 400 },
      );
    }

    const cardValues = [homeYc, homeYc2, homeRcDirect, homeYcRc, awayYc, awayYc2, awayRcDirect, awayYcRc];
    if (!cardValues.every(isValidCardCount)) {
      return NextResponse.json(
        { error: `Card counts must be integers between 0 and ${MAX_CARDS}` },
        { status: 400 },
      );
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
           home_yc = $3, home_yc2 = $4, home_rc_direct = $5, home_yc_rc = $6,
           away_yc = $7, away_yc2 = $8, away_rc_direct = $9, away_yc_rc = $10,
           status = $11, last_scraped = NOW()
       WHERE id = $12`,
      [homeGoals, awayGoals, homeYc, homeYc2, homeRcDirect, homeYcRc, awayYc, awayYc2, awayRcDirect, awayYcRc, status, matchId],
    );

    // Mark group as recalculating
    await query(
      `INSERT INTO recalc_status (group_id, is_recalculating, started_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (group_id) DO UPDATE SET is_recalculating = true, started_at = NOW()`,
      [groupId],
    );

    // Purge cache immediately so match results and standings reflect the DB update right away.
    // revalidateTag only works within an active Next.js request context (AsyncLocalStorage).
    // Background .then() callbacks run after the response is sent and the context is closed,
    // so any revalidateTag calls there are silently ignored. We therefore invalidate here
    // (within the request scope) and again after recalculation via the internal endpoint.
    revalidateTag(WC_TAG, 'max');
    revalidateTag(LEADERBOARD_TAG, 'max');

    const origin = new URL(request.url).origin;

    // Fire recalculation asynchronously (all groups + best-third + AI summaries + tip points)
    recalculateAllProbabilities()
      .then(async () => {
        console.log(`[admin] Recalculated all probabilities (triggered by group ${groupId})`);
        // Recalculate tip points for all users
        try {
          const tipResult = await recalculateAllTipPoints();
          console.log(`[admin] Recalculated tip points: ${tipResult} tips updated`);
        } catch (err) {
          console.error('[admin] Tip recalculation failed:', err);
        }
        // Pre-generate AI summaries so users don't wait on first page load
        try {
          await pregenerateBestThirdSummaries();
        } catch (err) {
          console.error('[admin] AI summary pregeneration failed:', err);
        }
        // Purge cache again via a fresh HTTP request so the updated probability data
        // (written to DB by recalculateAllProbabilities above) is also reflected.
        // A direct revalidateTag() call here would be a no-op because the original
        // request context has already closed.
        try {
          await fetch(`${origin}/api/internal/revalidate`, {
            method: 'POST',
            headers: { 'x-internal-secret': process.env.AUTH_SECRET ?? '' },
          });
        } catch (err) {
          console.error('[admin] Post-recalculation cache purge failed:', err);
        }
        await query('UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1', [groupId]);
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
