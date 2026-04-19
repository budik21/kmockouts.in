import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';

/**
 * Internal endpoint for cache invalidation after background tasks complete.
 *
 * Background tasks (fire-and-forget Promises) run after the route handler has
 * already returned a response, so the Next.js request context (AsyncLocalStorage)
 * is closed and revalidateTag has no effect when called directly from them.
 * This endpoint creates a fresh request context so revalidateTag works correctly.
 *
 * Protected by AUTH_SECRET so it cannot be called externally.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret');
  if (!secret || secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidateTag(WC_TAG, 'max');
  revalidateTag(LEADERBOARD_TAG, 'max');
  await purgeCloudflareCache();
  return NextResponse.json({ ok: true });
}
