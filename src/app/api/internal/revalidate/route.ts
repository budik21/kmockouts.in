import { NextRequest, NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { SITE_URL } from '@/lib/seo';

/**
 * Internal endpoint for cache invalidation after background tasks complete.
 *
 * Called by the standalone scraper process after the slow lane regenerates a
 * group's AI articles. `revalidateTag` only works inside the Next.js server, so
 * the cross-process scraper cannot call it directly — it POSTs here instead.
 * (Also usable by in-process fire-and-forget work whose request context has
 * already closed.)
 *
 * Protected by AUTH_SECRET so it cannot be called externally.
 *
 * Optional body `{ paths: string[] }` — site-relative paths. When provided, the
 * Cloudflare purge is TARGETED to just those URLs (least invasive). With no body
 * it falls back to a full `purge_everything`. The Next.js tags are always
 * revalidated coarsely (cheap, self-healing).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let paths: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.paths)) {
      paths = body.paths.filter((p: unknown): p is string => typeof p === 'string');
    }
  } catch {
    // No/!invalid body → broad purge (backward compatible).
  }

  expireTags(WC_TAG, LEADERBOARD_TAG);

  const urls = paths.map((p) => `${SITE_URL}${p.startsWith('/') ? p : `/${p}`}`);
  await purgeCloudflareCache(urls.length > 0 ? urls : undefined);

  return NextResponse.json({ ok: true, purgedUrls: urls.length > 0 ? urls : 'everything' });
}
