import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

/**
 * POST /api/admin/pickem/clear-all
 * Delete all tipster predictions. SUPERADMIN ONLY.
 *
 * This action only touches tips. Match results, cards, AI summaries and
 * probability caches are all result-derived and must remain untouched.
 * Tipster accounts also stay — only their predictions are removed.
 */
export async function POST() {
  const forbidden = await requireSuperadminApi();
  if (forbidden) return forbidden;

  try {
    await query('DELETE FROM tip');

    revalidateTag(LEADERBOARD_TAG, 'max');
    await purgeCloudflareCache();

    return NextResponse.json({
      success: true,
      message: "All tipster predictions deleted. Match results untouched.",
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/clear-all error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
