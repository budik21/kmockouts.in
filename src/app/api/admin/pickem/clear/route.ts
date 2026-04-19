import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

/**
 * Wipe all pick'em data (tips + tipster_user).
 * Intended for resetting after a simulation run.
 */
export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    await query(`DELETE FROM tip`);
    await query(`DELETE FROM tipster_user`);

    revalidateTag(LEADERBOARD_TAG, 'max');
    await purgeCloudflareCache();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/pickem/clear error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
