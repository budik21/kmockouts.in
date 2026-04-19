import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

/**
 * Wipe all pick'em data (tips + tipster_user). SUPERADMIN ONLY.
 */
export async function POST() {
  const forbidden = await requireSuperadminApi();
  if (forbidden) return forbidden;

  try {
    const countRows = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM tipster_user`);
    const tipsterCount = Number(countRows[0]?.count ?? 0);

    await query(`DELETE FROM tip`);
    await query(`DELETE FROM tipster_user`);

    revalidateTag(LEADERBOARD_TAG, 'max');
    await purgeCloudflareCache();

    return NextResponse.json({
      success: true,
      message: `Deleted ${tipsterCount} tipster${tipsterCount === 1 ? '' : 's'} and all their tips.`,
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/clear error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
