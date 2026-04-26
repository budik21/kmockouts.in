import path from 'path';
import fs from 'fs/promises';
import type { PreMatchContext, PostMatchContext } from './twitter-context';

export type OgVariant = 1 | 2 | 3;

const flagSvgCache = new Map<string, string>();

export async function loadFlagSvg(countryCode: string): Promise<string | null> {
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

export function svgToDataUrl(svg: string): string {
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

export interface OgRenderProps {
  ctx: PreMatchContext | PostMatchContext;
  flagDataUrl: string | null;
}

function probTriple(ctx: PreMatchContext | PostMatchContext) {
  return [
    { label: 'Advance', value: ctx.probabilities.advance, color: '#22c55e' },
    { label: '3rd-place', value: ctx.probabilities.thirdPlay, color: '#eab308' },
    { label: 'Eliminated', value: ctx.probabilities.eliminated, color: '#ef4444' },
  ];
}

function renderV1({ ctx, flagDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const headline = isPre ? 'NEXT UP' : 'FULL TIME';
  const accent = isPre ? '#3b82f6' : '#ef4444';
  const subline = isPre
    ? `${ctx.team.shortName} vs ${ctx.opponent.shortName} • ${formatKickOff(ctx.nextMatch.kickOff)}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName} • Round ${ctx.lastMatch.round}`;
  const probs = probTriple(ctx);

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
}

function renderV2({ ctx, flagDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const headline = isPre ? 'NEXT UP' : 'FULL TIME';
  const accent = isPre ? '#3b82f6' : '#ef4444';
  const probs = probTriple(ctx);
  const opponentLine = isPre
    ? `vs ${ctx.opponent.name}`
    : `${ctx.scoreLineFor} ${ctx.opponent.name}`;
  const detail = isPre
    ? formatKickOff(ctx.nextMatch.kickOff)
    : `Round ${ctx.lastMatch.round}`;

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'row',
        background: '#0b1220',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '480px',
          height: '675px',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1e293b',
          position: 'relative',
        }}
      >
        {flagDataUrl ? (
          <img
            src={flagDataUrl}
            width={480}
            height={675}
            style={{ width: '480px', height: '675px', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ display: 'flex', fontSize: '120px', fontWeight: 800, color: '#475569' }}>
            {ctx.team.shortName}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(11,18,32,0) 60%, #0b1220 100%)',
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '56px 56px 40px 24px' }}>
        <div style={{ display: 'flex', background: accent, color: '#0b1220', fontWeight: 800, padding: '8px 18px', borderRadius: '6px', fontSize: '22px', letterSpacing: '2px', alignSelf: 'flex-start' }}>{headline}</div>
        <div style={{ display: 'flex', fontSize: '64px', fontWeight: 800, marginTop: '24px', lineHeight: 1 }}>{ctx.team.name}</div>
        <div style={{ display: 'flex', fontSize: '32px', color: '#cbd5e1', marginTop: '14px' }}>{opponentLine}</div>
        <div style={{ display: 'flex', fontSize: '20px', color: '#64748b', marginTop: '6px' }}>
          Group {ctx.group.groupId} • {detail} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: '14px' }}>
          {probs.map((p) => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ display: 'flex', width: '180px', fontSize: '20px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{p.label}</div>
              <div style={{ display: 'flex', flex: 1, height: '18px', background: 'rgba(255,255,255,0.07)', borderRadius: '9px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', width: `${Math.max(2, p.value)}%`, height: '100%', background: p.color }} />
              </div>
              <div style={{ display: 'flex', width: '110px', justifyContent: 'flex-end', fontSize: '26px', fontWeight: 800, color: p.color }}>{p.value.toFixed(1)}%</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', color: '#475569', fontSize: '18px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

function renderV3({ ctx, flagDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const headline = isPre ? 'UPCOMING' : 'RESULT';
  const accent = isPre ? '#2563eb' : '#dc2626';
  const advance = ctx.probabilities.advance;
  const middleLine = isPre
    ? `vs ${ctx.opponent.name}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName}`;
  const detail = isPre
    ? formatKickOff(ctx.nextMatch.kickOff)
    : `Round ${ctx.lastMatch.round}`;

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'sans-serif',
        padding: '48px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', background: accent, color: '#fff', fontWeight: 800, padding: '8px 18px', borderRadius: '999px', fontSize: '22px', letterSpacing: '2px' }}>{headline}</div>
        <div style={{ display: 'flex', color: '#475569', fontSize: '22px' }}>
          Group {ctx.group.groupId} • {detail}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginTop: '36px' }}>
        {flagDataUrl ? (
          <img src={flagDataUrl} width={130} height={97} style={{ borderRadius: '8px', boxShadow: '0 4px 14px rgba(15,23,42,0.18)' }} />
        ) : (
          <div style={{ display: 'flex', width: '130px', height: '97px', background: '#e2e8f0', borderRadius: '8px', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 800 }}>
            {ctx.team.shortName}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1 }}>{ctx.team.name}</div>
          <div style={{ fontSize: '30px', color: '#475569', marginTop: '10px' }}>{middleLine}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '28px' }}>
        <div style={{ display: 'flex', fontSize: '20px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Advance to Round of 16</div>
        <div style={{ display: 'flex', fontSize: '170px', fontWeight: 900, color: accent, lineHeight: 1, marginTop: '6px' }}>{advance.toFixed(1)}%</div>
      </div>
      <div style={{ display: 'flex', gap: '20px', marginTop: 'auto' }}>
        <div style={{ display: 'flex', flex: 1, padding: '14px 22px', borderRadius: '10px', background: '#fef9c3', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: '18px', color: '#854d0e', textTransform: 'uppercase', letterSpacing: '1.5px' }}>3rd-place playoff</div>
          <div style={{ display: 'flex', fontSize: '36px', fontWeight: 800, color: '#854d0e' }}>{ctx.probabilities.thirdPlay.toFixed(1)}%</div>
        </div>
        <div style={{ display: 'flex', flex: 1, padding: '14px 22px', borderRadius: '10px', background: '#fee2e2', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: '18px', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Eliminated</div>
          <div style={{ display: 'flex', fontSize: '36px', fontWeight: 800, color: '#991b1b' }}>{ctx.probabilities.eliminated.toFixed(1)}%</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '18px', letterSpacing: '1px', paddingLeft: '6px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

export function renderForVariant(props: OgRenderProps, variant: OgVariant) {
  if (variant === 2) return renderV2(props);
  if (variant === 3) return renderV3(props);
  return renderV1(props);
}
