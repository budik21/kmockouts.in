import path from 'path';
import fs from 'fs/promises';
import type { PreMatchContext, PostMatchContext } from './twitter-context';

export type OgVariant = 1 | 2 | 3;

const flagSvgCache = new Map<string, string>();

/**
 * Loads a flag SVG. Pass `aspect: '1x1'` for a square (used in round/circular
 * presentations) or `'4x3'` for the wide rectangle.
 */
export async function loadFlagSvg(
  countryCode: string,
  aspect: '1x1' | '4x3' = '4x3',
): Promise<string | null> {
  const code = countryCode.toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return null;
  const cacheKey = `${aspect}:${code}`;
  const cached = flagSvgCache.get(cacheKey);
  if (cached) return cached;
  try {
    const svgPath = path.join(process.cwd(), 'node_modules', 'flag-icons', 'flags', aspect, `${code}.svg`);
    const raw = await fs.readFile(svgPath, 'utf-8');
    flagSvgCache.set(cacheKey, raw);
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
  /** 4:3 flag, used by all default layouts (rendered as a circle). */
  flagDataUrl: string | null;
  /** 1:1 flag — preferred for circular crops. Falls back to flagDataUrl. */
  flagSquareDataUrl?: string | null;
}

export type MilestoneKind = 'clinched' | 'eliminated' | null;

/**
 * Decides whether the team has reached a knockout milestone (clinched
 * advancement or mathematically eliminated). Used to swap the standard
 * variant body for a celebration/RIP layout.
 */
export function detectMilestone(ctx: PreMatchContext | PostMatchContext): MilestoneKind {
  if (ctx.probabilities.advance >= 99.5) return 'clinched';
  if (ctx.probabilities.eliminated >= 99.5) return 'eliminated';
  return null;
}

function probTriple(ctx: PreMatchContext | PostMatchContext) {
  return [
    { label: 'Advance', value: ctx.probabilities.advance, color: '#22c55e' },
    { label: '3rd-place', value: ctx.probabilities.thirdPlay, color: '#eab308' },
    { label: 'Eliminated', value: ctx.probabilities.eliminated, color: '#ef4444' },
  ];
}

/**
 * Round flag avatar — a circular crop of the country flag. Uses the 1:1
 * SVG when supplied, otherwise crops the 4:3 with overflow:hidden + cover.
 */
function FlagCircle({
  flagDataUrl,
  flagSquareDataUrl,
  size,
  ring,
  fallback,
}: {
  flagDataUrl: string | null;
  flagSquareDataUrl?: string | null;
  size: number;
  ring?: string;
  fallback: string;
}) {
  const src = flagSquareDataUrl ?? flagDataUrl;
  const ringStyle = ring
    ? { boxShadow: `0 0 0 4px ${ring}, 0 8px 22px rgba(0,0,0,0.45)` }
    : { boxShadow: '0 8px 22px rgba(0,0,0,0.45)' };

  if (src) {
    return (
      <div
        style={{
          display: 'flex',
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '9999px',
          overflow: 'hidden',
          background: '#1e293b',
          ...ringStyle,
        }}
      >
        <img
          src={src}
          width={size}
          height={size}
          style={{ width: `${size}px`, height: `${size}px`, objectFit: 'cover' }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        width: `${size}px`,
        height: `${size}px`,
        background: '#1e293b',
        borderRadius: '9999px',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${Math.round(size * 0.32)}px`,
        fontWeight: 800,
        color: '#f8fafc',
        ...ringStyle,
      }}
    >
      {fallback}
    </div>
  );
}

// ============================================================
// MILESTONE LAYOUTS — celebration / RIP overrides
// ============================================================

function renderClinched({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  const subline = ctx.kind === 'pre'
    ? `vs ${ctx.opponent.name} • ${formatKickOff(ctx.nextMatch.kickOff)}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName} • Round ${ctx.lastMatch.round}`;

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        // Festive gold/green gradient
        background: 'linear-gradient(135deg, #052e16 0%, #064e3b 35%, #0f3a1c 65%, #422006 100%)',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: '56px',
        position: 'relative',
      }}
    >
      {/* Confetti dots */}
      <div style={{ display: 'flex', position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {[
          { l: '8%', t: '12%', c: '#fde047', s: 14 },
          { l: '18%', t: '78%', c: '#22c55e', s: 10 },
          { l: '40%', t: '8%', c: '#facc15', s: 12 },
          { l: '62%', t: '22%', c: '#34d399', s: 16 },
          { l: '78%', t: '70%', c: '#fde047', s: 12 },
          { l: '90%', t: '15%', c: '#22c55e', s: 10 },
          { l: '30%', t: '88%', c: '#fde047', s: 8 },
          { l: '70%', t: '92%', c: '#34d399', s: 14 },
        ].map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: d.l,
              top: d.t,
              width: `${d.s}px`,
              height: `${d.s}px`,
              borderRadius: '9999px',
              background: d.c,
              opacity: 0.8,
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            background: '#fde047',
            color: '#422006',
            fontWeight: 900,
            padding: '10px 22px',
            borderRadius: '999px',
            fontSize: '24px',
            letterSpacing: '3px',
          }}
        >
          🏆 PLAYOFF SECURED
        </div>
        <div style={{ display: 'flex', color: '#a7f3d0', fontSize: '20px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '40px',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        <FlagCircle
          flagDataUrl={flagDataUrl}
          flagSquareDataUrl={flagSquareDataUrl}
          size={240}
          ring="#fde04766"
          fallback={ctx.team.shortName}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '92px', fontWeight: 900, lineHeight: 1, color: '#f8fafc' }}>
            {ctx.team.name}
          </div>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 800,
              color: '#fde047',
              marginTop: '14px',
              lineHeight: 1.05,
            }}
          >
            claimed the playoff!
          </div>
          <div style={{ fontSize: '24px', color: '#cbd5e1', marginTop: '14px' }}>
            {subline}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', color: '#bbf7d0', fontSize: '22px', fontWeight: 600 }}>
          Round of 16 • Mathematically guaranteed
        </div>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '20px', letterSpacing: '1px' }}>
          knockouts.in
        </div>
      </div>
    </div>
  );
}

function renderEliminated({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  const subline = ctx.kind === 'pre'
    ? `vs ${ctx.opponent.name} • ${formatKickOff(ctx.nextMatch.kickOff)}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName} • Round ${ctx.lastMatch.round}`;

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        // Sombre slate/charcoal
        background: 'linear-gradient(135deg, #020617 0%, #1e1b1f 50%, #0b0b10 100%)',
        color: '#e2e8f0',
        fontFamily: 'serif',
        padding: '56px',
        position: 'relative',
      }}
    >
      {/* Crosses scattered subtly in the background */}
      <div style={{ display: 'flex', position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.12 }}>
        {[
          { l: '6%', t: '20%', s: 28 },
          { l: '88%', t: '14%', s: 22 },
          { l: '12%', t: '80%', s: 18 },
          { l: '92%', t: '78%', s: 26 },
        ].map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: d.l,
              top: d.t,
              fontSize: `${d.s}px`,
              color: '#94a3b8',
            }}
          >
            ✚
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            background: '#1e293b',
            color: '#cbd5e1',
            fontWeight: 900,
            padding: '10px 22px',
            borderRadius: '6px',
            fontSize: '24px',
            letterSpacing: '4px',
            border: '1px solid #475569',
          }}
        >
          ⚰ ELIMINATED
        </div>
        <div style={{ display: 'flex', color: '#64748b', fontSize: '20px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        {/* Tombstone-style frame */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '44px 80px',
            background: 'rgba(15,23,42,0.55)',
            borderTopLeftRadius: '999px',
            borderTopRightRadius: '999px',
            border: '2px solid #334155',
            borderBottom: 'none',
            minWidth: '720px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '44px',
              fontWeight: 700,
              color: '#94a3b8',
              letterSpacing: '6px',
            }}
          >
            R · I · P
          </div>
          <FlagCircle
            flagDataUrl={flagDataUrl}
            flagSquareDataUrl={flagSquareDataUrl}
            size={130}
            ring="#33415566"
            fallback={ctx.team.shortName}
          />
          <div
            style={{
              fontSize: '70px',
              fontWeight: 800,
              color: '#f1f5f9',
              marginTop: '14px',
              lineHeight: 1,
              textAlign: 'center',
            }}
          >
            {ctx.team.name}
          </div>
          <div
            style={{
              fontSize: '26px',
              color: '#94a3b8',
              marginTop: '12px',
              fontStyle: 'italic',
            }}
          >
            World Cup 2026 • Group stage
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '20px', fontStyle: 'italic' }}>
          {subline}
        </div>
        <div style={{ display: 'flex', color: '#64748b', fontSize: '20px', letterSpacing: '1px' }}>
          knockouts.in
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STANDARD LAYOUTS — shown when no milestone is reached
// ============================================================

function renderV1({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
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
        <FlagCircle
          flagDataUrl={flagDataUrl}
          flagSquareDataUrl={flagSquareDataUrl}
          size={180}
          ring={`${accent}55`}
          fallback={ctx.team.shortName}
        />
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

function renderV2({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
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
        background: 'linear-gradient(135deg, #0b1220 0%, #1e293b 100%)',
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
          background: '#0f172a',
          position: 'relative',
        }}
      >
        <FlagCircle
          flagDataUrl={flagDataUrl}
          flagSquareDataUrl={flagSquareDataUrl}
          size={380}
          ring={`${accent}66`}
          fallback={ctx.team.shortName}
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

function renderV3({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
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
        <FlagCircle
          flagDataUrl={flagDataUrl}
          flagSquareDataUrl={flagSquareDataUrl}
          size={120}
          ring={`${accent}33`}
          fallback={ctx.team.shortName}
        />
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
  // Milestone auto-override: when a team has clinched or been eliminated,
  // every variant collapses to the celebration / RIP layout. Variant choice
  // is preserved in the URL so the admin can still pick "the green one" or
  // "the dark one"; both render the same milestone screen.
  const milestone = detectMilestone(props.ctx);
  if (milestone === 'clinched') return renderClinched(props);
  if (milestone === 'eliminated') return renderEliminated(props);

  if (variant === 2) return renderV2(props);
  if (variant === 3) return renderV3(props);
  return renderV1(props);
}
