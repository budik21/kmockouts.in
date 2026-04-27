import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { auth } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { isTwitterConfigured, postTweet, recordTweet, type TwitterTemplate, type TwitterMediaKind } from '@/lib/twitter';
import { buildPreMatchContext, buildPostMatchContext, teamPageUrl, APPENDED_URL_WEIGHT } from '@/lib/twitter-context';
import { renderForVariant, loadFlagSvg, svgToDataUrl, type OgVariant } from '@/lib/twitter-og';

export const runtime = 'nodejs';

const MAX_TEXT_LEN = 280;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif']);

function mimeToKind(mime: string): TwitterMediaKind {
  return mime === 'image/gif' ? 'gif' : 'image';
}

async function renderScenarioPng(teamId: number, kind: 'pre' | 'post', variant: OgVariant): Promise<Buffer> {
  const ctx = kind === 'pre'
    ? await buildPreMatchContext(teamId)
    : await buildPostMatchContext(teamId);

  const [flagSvg, flagSquareSvg, opponentFlagSvg, opponentFlagSquareSvg] = await Promise.all([
    loadFlagSvg(ctx.team.countryCode, '4x3'),
    loadFlagSvg(ctx.team.countryCode, '1x1'),
    loadFlagSvg(ctx.opponent.countryCode, '4x3'),
    loadFlagSvg(ctx.opponent.countryCode, '1x1'),
  ]);
  const flagDataUrl = flagSvg ? svgToDataUrl(flagSvg) : null;
  const flagSquareDataUrl = flagSquareSvg ? svgToDataUrl(flagSquareSvg) : null;
  const opponentFlagDataUrl = opponentFlagSvg ? svgToDataUrl(opponentFlagSvg) : null;
  const opponentFlagSquareDataUrl = opponentFlagSquareSvg ? svgToDataUrl(opponentFlagSquareSvg) : null;

  const response = new ImageResponse(renderForVariant({
    ctx,
    flagDataUrl,
    flagSquareDataUrl,
    opponentFlagDataUrl,
    opponentFlagSquareDataUrl,
  }, variant), {
    width: 1200,
    height: 675,
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  const session = await auth();
  const email = session?.user?.email;
  if (email !== SUPERADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isTwitterConfigured()) {
    return NextResponse.json(
      { error: 'Twitter API not configured. Set TWITTER_API_KEY/SECRET and TWITTER_ACCESS_TOKEN/SECRET on the server.' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const text = String(formData.get('text') ?? '').trim();
  const template = String(formData.get('template') ?? '') as TwitterTemplate;
  const teamIdRaw = formData.get('teamId');
  const matchIdRaw = formData.get('matchId');
  const ogKindRaw = formData.get('ogKind');
  const variantRaw = Number(formData.get('variant') ?? '1');
  const variant: OgVariant = variantRaw === 2 ? 2 : variantRaw === 3 ? 3 : 1;
  const includeGraphic = formData.get('includeGraphic') === 'true';
  const includeUrl = formData.get('includeUrl') !== 'false';

  if (!text) {
    return NextResponse.json({ error: 'Tweet text is required' }, { status: 400 });
  }
  if (!['simple', 'scenario_pre', 'scenario_post'].includes(template)) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
  }

  const teamId = teamIdRaw ? Number(teamIdRaw) : null;
  const matchId = matchIdRaw ? Number(matchIdRaw) : null;

  let finalText = text;
  if ((template === 'scenario_pre' || template === 'scenario_post') && includeUrl) {
    if (!teamId) {
      return NextResponse.json({ error: 'teamId required for scenario template' }, { status: 400 });
    }
    try {
      const ctx = template === 'scenario_pre'
        ? await buildPreMatchContext(teamId)
        : await buildPostMatchContext(teamId);
      const url = teamPageUrl(ctx.team);
      finalText = `${text} ${url}`;
      if ([...text].length + APPENDED_URL_WEIGHT > MAX_TEXT_LEN) {
        return NextResponse.json(
          { error: `Tweet text exceeds ${MAX_TEXT_LEN - APPENDED_URL_WEIGHT} characters once the team URL is appended` },
          { status: 400 },
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to append team URL' },
        { status: 400 },
      );
    }
  } else {
    if ([...text].length > MAX_TEXT_LEN) {
      return NextResponse.json({ error: `Tweet text exceeds ${MAX_TEXT_LEN} characters` }, { status: 400 });
    }
  }

  let mediaBuffer: Buffer | null = null;
  let mediaMime: 'image/png' | 'image/jpeg' | 'image/gif' | null = null;

  const file = formData.get('media');
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Unsupported media type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: `Media exceeds ${MAX_MEDIA_BYTES} bytes` }, { status: 400 });
    }
    mediaBuffer = Buffer.from(await file.arrayBuffer());
    mediaMime = file.type as 'image/png' | 'image/jpeg' | 'image/gif';
  } else if (includeGraphic && (template === 'scenario_pre' || template === 'scenario_post')) {
    if (!teamId || (ogKindRaw !== 'pre' && ogKindRaw !== 'post')) {
      return NextResponse.json({ error: 'teamId and ogKind=pre|post required for scenario template' }, { status: 400 });
    }
    try {
      mediaBuffer = await renderScenarioPng(teamId, ogKindRaw, variant);
      mediaMime = 'image/png';
    } catch (err) {
      console.error('Scenario OG render failed:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : 'OG render failed' }, { status: 500 });
    }
  }

  try {
    const result = await postTweet({
      text: finalText,
      ...(mediaBuffer && mediaMime ? { media: { buffer: mediaBuffer, mimeType: mediaMime } } : {}),
    });

    await recordTweet({
      tweetId: result.tweetId,
      text: finalText,
      template,
      mediaKind: mediaMime ? mimeToKind(mediaMime) : null,
      teamId: teamId ?? null,
      matchId: matchId ?? null,
      postedByEmail: email,
    });

    return NextResponse.json({ ok: true, tweetId: result.tweetId, url: result.url });
  } catch (err) {
    console.error('POST /api/admin/twitter/post error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Twitter API error: ${msg}` }, { status: 502 });
  }
}
