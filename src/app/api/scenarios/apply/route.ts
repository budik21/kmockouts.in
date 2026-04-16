import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdminApi } from '@/lib/admin-auth';
import { applyScenario } from '@/lib/apply-scenario';
import { recalculateAllProbabilities } from '@/lib/probability-cache';
import { recalculateAllTipPoints } from '@/lib/tip-recalc';
import { query } from '@/lib/db';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';

export const dynamic = 'force-dynamic';

/**
 * POST /api/scenarios/apply
 * Body: { scenarioId: number }  (0 = reset to clean state)
 *
 * Applies a scenario by updating match results in the DB. Admin-only.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const scenarioId: number = body.scenarioId;

    const matchesApplied = await applyScenario(scenarioId);

    // Invalidate AI summary cache so commentary regenerates fresh for the new data
    await query('DELETE FROM ai_summary_cache');

    await recalculateAllProbabilities();

    // Recalculate tip points (scenario changes match results → tips need rescoring)
    await recalculateAllTipPoints();

    // Purge tagged caches for all pages that show match results / probabilities / tips
    revalidateTag(WC_TAG, 'max');
    revalidateTag(LEADERBOARD_TAG, 'max');

    if (scenarioId === 0) {
      return NextResponse.json({ success: true, message: 'Reset to clean state', active: null });
    }

    return NextResponse.json({
      success: true,
      message: `Applied scenario ${scenarioId}`,
      active: scenarioId,
      matchesApplied,
    });
  } catch (error) {
    console.error('Apply scenario error:', error);
    return NextResponse.json({ error: 'Failed to apply scenario' }, { status: 500 });
  }
}
