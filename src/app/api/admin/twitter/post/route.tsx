import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import path from 'path';
import fs from 'fs/promises';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { auth } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { isTwitterConfigured, postTweet, recordTweet, type TwitterTemplate, type TwitterMediaKind } from '@/lib/twitter';
import { buildPreMatchContext, buildPostMatchContext, teamPageUrl, APPENDED_URL_WEIGHT } from '@/lib/twitter-context';

export const runtime = 'nodejs';

const MAX_TEXT_LEN = 280;
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif']);

function mimeToKind(mime: string): TwitterMediaKind {
  return mime === 'image/gif' ? 'gif' : 'image';
}

const flagSvgCache = new Map<string, string>();

async function loadFlagSvg(countryCode: string): Promise<string | null> {
  const code = countryCode.toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return null;
  const cached = flagSvgCache.get(code);
  if (cached) return cached;
  try {
    const svgPath = path.join(process.cwd(), 'node_modules', 'flag-icons', 'flags', '4x3', `${code}.svg`);
    const raw = await fs.readFile(svgPath, 'utf-8');
    flagSvgCache.set(code, raw);
    return raw;
  } catch {
    return null;
  }
}

async function renderScenarioPng(teamId: number, kind: 'pre' | 'post'): Promise<Buffer> {
  const ctx = kind === 'pre'
    ? await buildPreMatchContext(teamId)
    : await buildPostMatchContext(teamId);

  const flagSvg = await loadFlagSvg(ctx.team.countryCode);
  const flagDataUrl = flagSvg
    ? `data:image/svg+xml;base64,${Buffer.from(flagSvg, 'utf-8').toString('base64')}`
    : null;

  const headline = ctx.kind === 'pre' ? 'NEXT UP' : 'FULL TIME';
  const accent = ctx.kind === 'pre' ? '#3b82f6' : '#ef4444';
  const subline = ctx.kind === 'pre'
    ? `${ctx.team.shortName} vs ${ctx.opponent.shortName} • ${new Date(ctx.nextMatch.kickOff).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName} • Round ${ctx.lastMatch.round}`;

  const probs = [
    { label: 'Advance', value: ctx.probabilities.advance, color: '#22c55e' },
    { label: '3rd-place', value: ctx.probabilities.thirdPlay, color: '#eab308' },
    { label: 'Eliminated', value: ctx.probabilities.eliminated, color: '#ef4444' },
  ];

  const node = (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0b1220 100%)',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: '48px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', background: accent, color: '#0b1220', fontWeight: 800, padding: '8px 18px', borderRadius: '6px', fontSize: '24px', letterSpacing: '2px' }}>{headline}</div>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '22px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} matches played
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginTop: '40px' }}>
        {flagDataUrl ? (
          <img src={flagDataUrl} width={220} height={165} style={{ borderRadius: '10px', boxShadow: '0 8px 22px rgba(0,0,0,0.45)' }} />
        ) : (
          <div style={{ display: 'flex', width: '220px', height: '165px', background: '#1e293b', borderRadius: '10px', alignItems: 'center', justifyContent: 'center', fontSize: '48px', fontWeight: 800 }}>
            {ctx.team.shortName}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '70px', fontWeight: 800, lineHeight: 1, color: '#f8fafc' }}>{ctx.team.name}</div>
          <div style={{ fontSize: '28px', color: '#cbd5e1', marginTop: '14px' }}>{subline}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '24px', marginTop: 'auto' }}>
        {probs.map((p) => (
          <div key={p.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 28px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', border: `1px solid ${p.color}40` }}>
            <div style={{ display: 'flex', fontSize: '20px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{p.label}</div>
            <div style={{ display: 'flex', fontSize: '64px', fontWeight: 800, color: p.color, marginTop: '6px' }}>{p.value.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
        <div style={{ color: '#475569', fontSize: '20px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );

  const response = new ImageResponse(node, { width: 1200, height: 675 });
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

  if (!text) {
    return NextResponse.json({ error: 'Tweet text is required' }, { status: 400 });
  }
  if (!['simple', 'scenario_pre', 'scenario_post'].includes(template)) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
  }

  const teamId = teamIdRaw ? Number(teamIdRaw) : null;
  const matchId = matchIdRaw ? Number(matchIdRaw) : null;

  // Scenario tweets get the team page URL auto-appended on the server so
  // counter and prompt stay deterministic regardless of what the editor
  // typed. Twitter weighs the appended URL as 23 chars (t.co) plus 1 space.
  let finalText = text;
  if (template === 'scenario_pre' || template === 'scenario_post') {
    if (!teamId) {
      return NextResponse.json({ error: 'teamId required for scenario template' }, { status: 400 });
    }
    try {
      const ctx = template === 'scenario_pre'
        ? await buildPreMatchContext(teamId)
        : await buildPostMatchContext(teamId);
      const url = teamPageUrl(ctx.team);
      finalText = `${text} ${url}`;
      // Weighted length check: own text + space + 23 (t.co) <= 280
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

  // Path A: explicit file upload (simple template)
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
  } else if (template === 'scenario_pre' || template === 'scenario_post') {
    // Path B: scenario template — server renders OG image fresh
    if (!teamId || (ogKindRaw !== 'pre' && ogKindRaw !== 'post')) {
      return NextResponse.json({ error: 'teamId and ogKind=pre|post required for scenario template' }, { status: 400 });
    }
    try {
      mediaBuffer = await renderScenarioPng(teamId, ogKindRaw);
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
