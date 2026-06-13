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

/** Aggregate pages whose content reflects the whole tournament — they change
 *  whenever ANY group or team changes, so we re-warm them for every scope. */
const AGGREGATE_PATHS = [
  '/worldcup2026',
  '/worldcup2026/best-third-placed',
  '/worldcup2026/fixtures',
];

/** Which slice of the WC pages to purge/warm. */
export type WarmScope =
  | { kind: 'all' }
  | { kind: 'group'; groupId: string }
  | { kind: 'team'; teamId: number };

export interface WarmTarget {
  /** Absolute URLs (under SITE_URL) to purge and warm. */
  urls: string[];
  /** Human label for admin messages, e.g. "all WC pages", "group A", "Brazil". */
  label: string;
}

function teamUrl(name: string, groupId: string): string {
  return `${SITE_URL}/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(name)}`;
}

function groupUrl(groupId: string): string {
  return `${SITE_URL}/worldcup2026/group-${groupId.toLowerCase()}`;
}

/**
 * Collect the WC routes to purge/warm for the given scope.
 *
 *  - `all`   — every aggregate, group and team page (the full sweep used after
 *              a `purge_everything`). Adjust here when new
 *              ai_predictions_display-dependent pages are added.
 *  - `group` — the aggregates + the group page + every (non-placeholder) team
 *              page in that group.
 *  - `team`  — the aggregates + the team's group page + the team page itself.
 *              Aggregates and the group page are included because a single
 *              team's standings ripple into the group table and overview.
 */
export async function collectWcUrls(scope: WarmScope = { kind: 'all' }): Promise<WarmTarget> {
  const urls: string[] = AGGREGATE_PATHS.map((p) => `${SITE_URL}${p}`);

  if (scope.kind === 'all') {
    for (const g of ALL_GROUPS) urls.push(groupUrl(g));
    try {
      const rows = await query<{ name: string; group_id: string }>(
        'SELECT name, group_id FROM team WHERE is_placeholder = false ORDER BY group_id, id',
      );
      for (const r of rows) urls.push(teamUrl(r.name, r.group_id));
    } catch (err) {
      console.warn('[cache-warmup] team enumeration failed:', err);
    }
    return { urls, label: 'all WC pages' };
  }

  if (scope.kind === 'group') {
    const g = scope.groupId.toUpperCase();
    urls.push(groupUrl(g));
    try {
      const rows = await query<{ name: string }>(
        'SELECT name FROM team WHERE group_id = $1 AND is_placeholder = false ORDER BY id',
        [g],
      );
      for (const r of rows) urls.push(teamUrl(r.name, g));
    } catch (err) {
      console.warn('[cache-warmup] group team enumeration failed:', err);
    }
    return { urls, label: `group ${g}` };
  }

  // scope.kind === 'team'
  try {
    const rows = await query<{ name: string; group_id: string }>(
      'SELECT name, group_id FROM team WHERE id = $1',
      [scope.teamId],
    );
    const team = rows[0];
    if (team) {
      urls.push(groupUrl(team.group_id));
      urls.push(teamUrl(team.name, team.group_id));
      return { urls, label: team.name };
    }
  } catch (err) {
    console.warn('[cache-warmup] team lookup failed:', err);
  }
  return { urls, label: `team ${scope.teamId}` };
}

/**
 * Warm the given URLs. Safe to call as fire-and-forget — it catches everything
 * internally and logs rather than throwing. Returns the elapsed time so callers
 * that await it can report timing.
 */
export async function warmUrls(urls: string[]): Promise<number> {
  const startedAt = Date.now();
  try {
    console.log(`[cache-warmup] warming ${urls.length} URLs`);
    await runWithConcurrency(urls, CONCURRENCY);
    console.log(`[cache-warmup] done in ${Date.now() - startedAt}ms`);
  } catch (err) {
    console.error('[cache-warmup] unexpected error:', err);
  }
  return Date.now() - startedAt;
}

/**
 * Warm every WC page. Safe to call as fire-and-forget — it catches
 * everything internally and logs rather than throwing.
 */
export async function warmWcPages(): Promise<void> {
  const { urls } = await collectWcUrls();
  await warmUrls(urls);
}