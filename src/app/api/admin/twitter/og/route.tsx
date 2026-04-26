import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { buildPreMatchContext, buildPostMatchContext } from '@/lib/twitter-context';
import type { PreMatchContext, PostMatchContext } from '@/lib/twitter-context';

export const runtime = 'nodejs';

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

function svgToDataUrl(svg: string): string {
  // Encode unicode-safe; satori accepts data URLs as <img src=...>
  const utf8 = Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${utf8}`;
}

function formatKickOff(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return iso;
  }
}

interface RenderProps {
  ctx: PreMatchContext | PostMatchContext;
  flagDataUrl: string | null;
}

function renderOg({ ctx, flagDataUrl }: RenderProps) {
  const isPre = ctx.kind === 'pre';
  const headline = isPre ? 'NEXT UP' : 'FULL TIME';
  const accent = isPre ? '#3b82f6' : '#ef4444';
  const subline = isPre
    ? `${ctx.team.shortName} vs ${ctx.opponent.shortName} • ${formatKickOff(ctx.nextMatch.kickOff)}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName} • Round ${ctx.lastMatch.round}`;

  const probs = [
    { label: 'Advance', value: ctx.probabilities.advance, color: '#22c55e' },
    { label: '3rd-place', value: ctx.probabilities.thirdPlay, color: '#eab308' },
    { label: 'Eliminated', value: ctx.probabilities.eliminated, color: '#ef4444' },
  ];

  return (
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
        <div
          style={{
            display: 'flex',
            background: accent,
            color: '#0b1220',
            fontWeight: 800,
            padding: '8px 18px',
            borderRadius: '6px',
            fontSize: '24px',
            letterSpacing: '2px',
          }}
        >
          {headline}
        </div>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '22px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} matches played
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginTop: '40px' }}>
        {flagDataUrl ? (
          <img
            src={flagDataUrl}
            width={220}
            height={165}
            style={{ borderRadius: '10px', boxShadow: '0 8px 22px rgba(0,0,0,0.45)' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              width: '220px',
              height: '165px',
              background: '#1e293b',
              borderRadius: '10px',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              fontWeight: 800,
            }}
          >
            {ctx.team.shortName}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '70px', fontWeight: 800, lineHeight: 1, color: '#f8fafc' }}>
            {ctx.team.name}
          </div>
          <div style={{ fontSize: '28px', color: '#cbd5e1', marginTop: '14px' }}>{subline}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginTop: 'auto' }}>
        {probs.map((p) => (
          <div
            key={p.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '24px 28px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '14px',
              border: `1px solid ${p.color}40`,
            }}
          >
            <div style={{ display: 'flex', fontSize: '20px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              {p.label}
            </div>
            <div style={{ display: 'flex', fontSize: '64px', fontWeight: 800, color: p.color, marginTop: '6px' }}>
              {p.value.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
        <div style={{ color: '#475569', fontSize: '20px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const teamId = Number(searchParams.get('teamId'));
  const kind = searchParams.get('kind');

  if (!Number.isFinite(teamId) || (kind !== 'pre' && kind !== 'post')) {
    return new Response('teamId (number) and kind=pre|post required', { status: 400 });
  }

  try {
    const ctx = kind === 'pre'
      ? await buildPreMatchContext(teamId)
      : await buildPostMatchContext(teamId);

    const flagSvg = await loadFlagSvg(ctx.team.countryCode);
    const flagDataUrl = flagSvg ? svgToDataUrl(flagSvg) : null;

    return new ImageResponse(renderOg({ ctx, flagDataUrl }), {
      width: 1200,
      height: 675,
    });
  } catch (err) {
    console.error('GET /api/admin/twitter/og error:', err);
    return new Response(err instanceof Error ? err.message : 'OG render failed', { status: 500 });
  }
}
