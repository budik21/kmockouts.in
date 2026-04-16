import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { recalculateAllProbabilities } from '@/lib/probability-cache';

/**
 * POST /api/admin/recalculate
 * Recalculates and caches probabilities for all 12 groups.
 * Called by the scraper after updating match results, or manually.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const start = Date.now();
    await recalculateAllProbabilities();
    const elapsed = Date.now() - start;

    return NextResponse.json({
      success: true,
      message: `Probabilities recalculated for all groups in ${elapsed}ms`,
    });
  } catch (error) {
    console.error('Recalculation error:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate probabilities' },
      { status: 500 }
    );
  }
}
