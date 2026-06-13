import { NextRequest, NextResponse } from 'next/server';
import { expireTags } from '@/lib/cache-expire';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { collectWcUrls, warmUrls, type WarmScope } from '@/lib/cache-warmup';
import { ALL_GROUPS } from '@/lib/constants';
import type { GroupId } from '@/lib/types';

export const dynamic = 'force-dynamic';
// The full sweep warms ~50 URLs against the origin; give it room beyond the
// platform default so the admin gets a real "done" with timing.
export const maxDuration = 120;

interface Body {
  scope?: 'all' | 'group' | 'team';
  groupId?: string;
  teamId?: number;
}

/**
 * POST /api/admin/cloudflare/purge
 *
 * Superadmin-only Cloudflare cache management. Three scopes:
 *   - `all`   — Cloudflare `purge_everything` + re-warm every WC page.
 *   - `group` — purge + re-warm one group's pages (group + its team pages +
 *               the tournament aggregates).
 *   - `team`  — purge + re-warm a single team's page (+ its group + aggregates).
 *
 * In every case the Next.js caches (WC + leaderboard tags) are expired first so
 * the warm re-render captures fresh data, then the warm runs synchronously so
 * the response reports how many URLs were purged/warmed and how long it took.
 *
 * No-op on the Cloudflare side when CF_ZONE_ID / CF_API_TOKEN are unset — the
 * Next.js expiry + origin warm still run, which is harmless.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as Body;
    const scope = body.scope;

    if (scope !== 'all' && scope !== 'group' && scope !== 'team') {
      return NextResponse.json({ error: 'scope must be "all", "group" or "team"' }, { status: 400 });
    }

    let warmScope: WarmScope;
    if (scope === 'group') {
      const groupId = body.groupId as GroupId | undefined;
      if (!groupId || !ALL_GROUPS.includes(groupId)) {
        return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
      }
      warmScope = { kind: 'group', groupId };
    } else if (scope === 'team') {
      const teamId = body.teamId;
      if (!teamId || !Number.isInteger(teamId)) {
        return NextResponse.json({ error: 'teamId is required for scope=team' }, { status: 400 });
      }
      warmScope = { kind: 'team', teamId };
    } else {
      warmScope = { kind: 'all' };
    }

    const start = Date.now();

    // Expire the Next.js caches first, so the warm re-render below reads
    // freshly-recomputed data rather than re-pinning stale entries.
    expireTags(WC_TAG, LEADERBOARD_TAG);

    // Resolve the concrete URLs for this scope (also gives us a label for the
    // response message). The `all` scope uses Cloudflare's purge_everything;
    // scoped purges target only the affected files.
    const target = await collectWcUrls(warmScope);

    if (scope === 'all') {
      await purgeCloudflareCache();
    } else {
      await purgeCloudflareCache(target.urls);
    }

    // Warm synchronously so the admin sees timing and a real confirmation.
    const warmMs = await warmUrls(target.urls);
    const elapsedMs = Date.now() - start;

    const purgedDesc = scope === 'all'
      ? 'entire Cloudflare cache (purge_everything)'
      : `${target.urls.length} URL${target.urls.length === 1 ? '' : 's'} for ${target.label}`;

    const message =
      `Purged ${purgedDesc} and re-warmed ${target.urls.length} page${target.urls.length === 1 ? '' : 's'} ` +
      `in ${(elapsedMs / 1000).toFixed(1)}s (warm ${(warmMs / 1000).toFixed(1)}s).`;

    return NextResponse.json({
      success: true,
      message,
      scope,
      label: target.label,
      warmedCount: target.urls.length,
      elapsedMs,
      warmMs,
    });
  } catch (error) {
    console.error('POST /api/admin/cloudflare/purge error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
