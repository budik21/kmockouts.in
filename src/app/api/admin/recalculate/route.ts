import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { recalculateAllProbabilities } from '@/lib/probability-cache';

/**
 * POST /api/admin/recalculate
 * Recalculates and caches probabilities for all 12 groups.
 * Called by the scraper after updating match results, or manually.
 */
export async function POST() {
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (googleConfigured && !isDev) {
    const session = await auth();
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

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
