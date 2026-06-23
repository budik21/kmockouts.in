import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { recomputeKnockoutBracket } from '@/engine/knockout-sync';
import { recalculateAllPlayoffPoints } from '@/lib/knockout-recalc';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { expireTags } from '@/lib/cache-expire';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { isFeatureEnabled } from '@/lib/feature-flags';

/**
 * Rebuild the knockout_match table from the current group standings (resolving
 * R32 participants via FIFA Annex C) and propagate any already-entered results
 * into later rounds. Safe to run repeatedly. Run this once the group stage is
 * complete to populate the bracket, and any time standings change.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const written = await recomputeKnockoutBracket();
    const recalc = await recalculateAllPlayoffPoints();
    await recalculateLeagueStandings();
    expireTags(LEADERBOARD_TAG);
    return NextResponse.json({ success: true, matches: written, recalc });
  } catch (error) {
    console.error('POST /api/admin/knockout/sync error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
