import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { buildPreMatchContext, buildPostMatchContext } from '@/lib/twitter-context';
import { renderForVariant, loadFlagSvg, svgToDataUrl, type OgVariant } from '@/lib/twitter-og';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const teamId = Number(searchParams.get('teamId'));
  const kind = searchParams.get('kind');
  const variantRaw = Number(searchParams.get('variant') ?? '1');
  const variant: OgVariant = variantRaw === 2 ? 2 : variantRaw === 3 ? 3 : 1;

  if (!Number.isFinite(teamId) || (kind !== 'pre' && kind !== 'post')) {
    return new Response('teamId (number) and kind=pre|post required', { status: 400 });
  }

  try {
    const ctx = kind === 'pre'
      ? await buildPreMatchContext(teamId)
      : await buildPostMatchContext(teamId);

    const flagSvg = await loadFlagSvg(ctx.team.countryCode);
    const flagDataUrl = flagSvg ? svgToDataUrl(flagSvg) : null;

    return new ImageResponse(renderForVariant({ ctx, flagDataUrl }, variant), {
      width: 1200,
      height: 675,
    });
  } catch (err) {
    console.error('GET /api/admin/twitter/og error:', err);
    return new Response(err instanceof Error ? err.message : 'OG render failed', { status: 500 });
  }
}
