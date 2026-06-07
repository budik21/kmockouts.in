import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { queryOne } from '@/lib/db';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { SITE_URL } from '@/lib/seo';

/**
 * POST /api/admin/leagues/recalculate
 * Recalculate the standings of a single league. ADMIN access required.
 *
 * Body: { input: string } — either a bare league code (e.g. "H8TEVG") or a
 * full league URL (e.g. "https://knockouts.in/pickem/leagues/H8TEVG"). The
 * code is extracted from the last path segment when a URL/path is supplied.
 *
 * recalculateLeagueStandings() rewrites pickem_league_standings for the league
 * and busts its per-league cache tag; we also purge the league page at the CDN.
 */

/** Pull a league code out of a bare code or a URL/path. */
function extractLeagueCode(raw: string): string {
  let candidate = raw.trim();
  // If it looks like a URL or path, take the last non-empty segment.
  if (candidate.includes('/')) {
    const segments = candidate.split(/[?#]/)[0].split('/').filter(Boolean);
    candidate = segments[segments.length - 1] ?? '';
  }
  return normalizeLeagueCode(candidate);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json().catch(() => ({}))) as { input?: string };
    const raw = typeof body.input === 'string' ? body.input : '';
    if (!raw.trim()) {
      return NextResponse.json({ error: 'Provide a league code or URL.' }, { status: 400 });
    }

    const code = extractLeagueCode(raw);
    if (!isValidLeagueCode(code)) {
      return NextResponse.json(
        { error: `"${raw.trim()}" is not a valid league code or URL.` },
        { status: 400 },
      );
    }

    const league = await queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM pickem_league WHERE code = $1',
      [code],
    );
    if (!league) {
      return NextResponse.json({ error: `No league found for code ${code}.` }, { status: 404 });
    }

    await recalculateLeagueStandings(league.id);
    await purgeCloudflareCache([`${SITE_URL}/pickem/leagues/${code}`]);

    return NextResponse.json({
      success: true,
      message: `Recalculated standings for "${league.name}" (${code}).`,
      code,
      name: league.name,
    });
  } catch (err) {
    console.error('POST /api/admin/leagues/recalculate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
