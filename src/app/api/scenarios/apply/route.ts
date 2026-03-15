import { NextRequest, NextResponse } from 'next/server';
import { applyScenario } from '@/lib/apply-scenario';
import { recalculateAllProbabilities } from '@/lib/probability-cache';

export const dynamic = 'force-dynamic';

/**
 * POST /api/scenarios/apply
 * Body: { scenarioId: number }  (0 = reset to clean state)
 *
 * Applies a scenario by updating match results in the DB.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const scenarioId: number = body.scenarioId;

    const matchesApplied = await applyScenario(scenarioId);
    await recalculateAllProbabilities();

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
