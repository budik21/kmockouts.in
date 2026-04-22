/**
 * Warm up the Cloudflare edge (and Next.js Full Route Cache) after a purge.
 *
 * After `purgeCloudflareCache()`, the first visitor of each page pays the
 * cold-cache cost: origin render + network round-trip. For routes that are
 * a few seconds to render (team pages with probability lookups) this is
 * noticeable. Fire-and-forget `warmWcPages()` right after a purge so
 * subsequent users see a warm cache instead.
 *
 * Strategy: enumerate every WC page that depends on `WC_TAG` (group
 * pages, team detail pages, best-third-placed) and issue plain GET
 * requests in parallel with a concurrency cap. Each response lands in
 * Cloudflare's cache on the way back. We target `SITE_URL` because
 * that's the canonical public origin Cloudflare fronts.
 */

import { query } from './db';
import { SITE_URL } from './seo';
import { slugify } from './slugify';
import { ALL_GROUPS } from './constants';

const CONCURRENCY = 6;
const PER_REQUEST_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'knockouts-warmup/1.0' },
      // Ensure we don't accidentally pull a stale Next fetch-layer cache
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[cache-warmup] ${res.status} ${url}`);
    }
    // Drain body so the connection can close cleanly
    await res.arrayBuffer().catch(() => null);
  } catch (err) {
    console.warn(`[cache-warmup] failed ${url}:`, err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }
}

async function runWithConcurrency(urls: string[], limit: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, urls.length) }, async () => {
    while (i < urls.length) {
      const idx = i++;
      await fetchWithTimeout(urls[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * Collect every WC route we want warm. Adjust here when new
 * ai_predictions_display-dependent pages are added.
 */
async function collectUrls(): Promise<string[]> {
  const urls: string[] = [
    `${SITE_URL}/worldcup2026`,
    `${SITE_URL}/worldcup2026/best-third-placed`,
    `${SITE_URL}/worldcup2026/fixtures`,
  ];

  for (const g of ALL_GROUPS) {
    urls.push(`${SITE_URL}/worldcup2026/group-${g.toLowerCase()}`);
  }

  try {
    const rows = await query<{ name: string; group_id: string }>(
      'SELECT name, group_id FROM team ORDER BY group_id, id',
    );
    for (const r of rows) {
      urls.push(
        `${SITE_URL}/worldcup2026/group-${r.group_id.toLowerCase()}/team/${slugify(r.name)}`,
      );
    }
  } catch (err) {
    console.warn('[cache-warmup] team enumeration failed:', err);
  }

  return urls;
}

/**
 * Warm every WC page. Safe to call as fire-and-forget — it catches
 * everything internally and logs rather than throwing.
 */
export async function warmWcPages(): Promise<void> {
  try {
    const urls = await collectUrls();
    console.log(`[cache-warmup] warming ${urls.length} URLs`);
    const startedAt = Date.now();
    await runWithConcurrency(urls, CONCURRENCY);
    console.log(`[cache-warmup] done in ${Date.now() - startedAt}ms`);
  } catch (err) {
    console.error('[cache-warmup] unexpected error:', err);
  }
}