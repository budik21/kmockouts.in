import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { setFeatureFlag, listFeatureFlags } from '@/lib/feature-flags';
import { WC_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { warmWcPages } from '@/lib/cache-warmup';

const ALLOWED_KEYS = new Set(['ai_predictions', 'ai_predictions_display']);

export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const { key, enabled } = (await request.json()) as { key?: unknown; enabled?: unknown };
    if (typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: 'Unknown feature flag key' }, { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }
    await setFeatureFlag(key, enabled);
    const flags = await listFeatureFlags();

    // Flags that change page content require purging Next's Full Route Cache
    // and the Cloudflare edge, otherwise visitors keep seeing the previous
    // render. ai_predictions_display is the obvious case; we purge on every
    // flag change since toggles are rare and a blanket purge keeps the
    // handler simple.
    revalidateTag(WC_TAG, 'max');
    await purgeCloudflareCache();

    // Fire-and-forget warm-up so the first real visitor of each WC page
    // doesn't pay the cold-cache cost after a purge.
    warmWcPages().catch((err) => console.error('[feature-flags] warmup error:', err));

    return NextResponse.json({ success: true, flags });
  } catch (err) {
    console.error('POST /api/admin/feature-flags error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
