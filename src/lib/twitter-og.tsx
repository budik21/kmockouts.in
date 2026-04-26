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
  const code = countryCode.trim().toLowerCase();
  if (!code || !/^[a-z]{2}(?:-[a-z0-9]{1,3})?$/.test(code)) return null;
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
  opponentFlagDataUrl?: string | null;
  opponentFlagSquareDataUrl?: string | null;
}

export type MilestoneKind = 'clinched' | 'eliminated' | null;

/**
 * Decides whether the team has reached a knockout milestone (clinched
 * advancement or mathematically eliminated). Used to swap the standard
 * variant body for a celebration/RIP layout.
 */
export function detectMilestone(ctx: PreMatchContext | PostMatchContext): MilestoneKind {
  const totalAdvance = ctx.probabilities.advance + ctx.probabilities.thirdPlay;
  if (totalAdvance >= 99.5) return 'clinched';
  if (ctx.probabilities.eliminated >= 99.5) return 'eliminated';
  return null;
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
          alt=""
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
// MILESTONE LAYOUTS — three celebration variants and three
// elimination variants, each matching the personality of the
// corresponding standard layout (V1 dark hero, V2 bold flag,
// V3 stat focus).
// ============================================================

function subline(ctx: PreMatchContext | PostMatchContext): string {
  return ctx.kind === 'pre'
    ? `vs ${ctx.opponent.name} • ${formatKickOff(ctx.nextMatch.kickOff)}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName} • Round ${ctx.lastMatch.round}`;
}

// ---------- CLINCHED ----------

function renderClinchedV1({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  // V1 — dark hero with confetti dots, gold pill, big team name (matches
  // the original V1 "Modern Dark" palette).
  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #052e16 0%, #064e3b 35%, #0f3a1c 65%, #422006 100%)',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: '56px',
        position: 'relative',
      }}
    >
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
        <div style={{ display: 'flex', background: '#fde047', color: '#422006', fontWeight: 900, padding: '10px 22px', borderRadius: '999px', fontSize: '24px', letterSpacing: '3px' }}>
          🏆 PLAYOFF SECURED
        </div>
        <div style={{ display: 'flex', color: '#a7f3d0', fontSize: '20px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '40px', marginTop: 'auto', marginBottom: 'auto' }}>
        <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={240} ring="#fde04766" fallback={ctx.team.shortName} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '92px', fontWeight: 900, lineHeight: 1, color: '#f8fafc' }}>{ctx.team.name}</div>
          <div style={{ fontSize: '40px', fontWeight: 800, color: '#fde047', marginTop: '14px', lineHeight: 1.05 }}>claimed the playoff!</div>
          <div style={{ fontSize: '24px', color: '#cbd5e1', marginTop: '14px' }}>{subline(ctx)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', color: '#bbf7d0', fontSize: '22px', fontWeight: 600 }}>
          Round of 32 • Mathematically guaranteed
        </div>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '20px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

function renderClinchedV2({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  // V2 — matches "Bold Flag": giant flag on the left half, gold ribbon on
  // the right with the headline + standings hint.
  const standing = ctx.standings.find(s => s.teamName === ctx.team.name);
  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'row',
        background: 'linear-gradient(90deg, #052e16 0%, #14532d 100%)',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', width: '520px', height: '675px', alignItems: 'center', justifyContent: 'center', background: '#022c22', position: 'relative' }}>
        <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={420} ring="#fde04766" fallback={ctx.team.shortName} />
        {/* Diagonal gold ribbon */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '90px',
            left: '-60px',
            transform: 'rotate(-22deg)',
            background: '#fde047',
            color: '#422006',
            padding: '8px 80px',
            fontWeight: 900,
            fontSize: '22px',
            letterSpacing: '4px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          }}
        >
          🏆 INTO THE R32
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '60px 56px 40px 36px' }}>
        <div style={{ display: 'flex', color: '#a7f3d0', fontSize: '22px', letterSpacing: '2px' }}>
          GROUP {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} PLAYED
        </div>
        <div style={{ display: 'flex', fontSize: '78px', fontWeight: 900, marginTop: '8px', lineHeight: 1, color: '#fde047' }}>
          {ctx.team.name}
        </div>
        <div style={{ display: 'flex', fontSize: '34px', fontWeight: 700, color: '#f8fafc', marginTop: '14px', lineHeight: 1.1 }}>
          is through to the Round of 32
        </div>
        {standing && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: '6px' }}>
            <div style={{ display: 'flex', fontSize: '20px', color: '#bbf7d0', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Current standing</div>
            <div style={{ display: 'flex', fontSize: '40px', fontWeight: 800, color: '#f8fafc' }}>
              #{standing.position} · {standing.points} pts · {standing.goalDifference >= 0 ? '+' : ''}{standing.goalDifference} GD
            </div>
          </div>
        )}
        <div style={{ display: 'flex', fontSize: '20px', color: '#cbd5e1', marginTop: '14px' }}>{subline(ctx)}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', color: '#475569', fontSize: '18px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

function renderClinchedV3({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  // V3 — "Stat Focus": clean light card with a giant ✓ THROUGH and the
  // 100% advance number front and centre.
  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
        color: '#0f172a',
        fontFamily: 'sans-serif',
        padding: '48px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', background: '#16a34a', color: '#fff', fontWeight: 800, padding: '8px 18px', borderRadius: '999px', fontSize: '22px', letterSpacing: '2px' }}>
          ✓ THROUGH
        </div>
        <div style={{ display: 'flex', color: '#475569', fontSize: '22px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginTop: '36px' }}>
        <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={120} ring="#16a34a33" fallback={ctx.team.shortName} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1 }}>{ctx.team.name}</div>
          <div style={{ fontSize: '28px', color: '#15803d', marginTop: '10px', fontWeight: 600 }}>has clinched a Round of 32 spot</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '28px' }}>
        <div style={{ display: 'flex', fontSize: '20px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Advance probability</div>
        <div style={{ display: 'flex', fontSize: '180px', fontWeight: 900, color: '#16a34a', lineHeight: 1, marginTop: '6px' }}>100%</div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: 'auto' }}>
        <div style={{ display: 'flex', flex: 1, padding: '14px 22px', borderRadius: '10px', background: '#dcfce7', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: '18px', color: '#14532d', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Status</div>
          <div style={{ display: 'flex', fontSize: '28px', fontWeight: 800, color: '#14532d' }}>Knockouts secured</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '18px', letterSpacing: '1px', paddingLeft: '6px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

// ---------- ELIMINATED (no RIP / no graveyard imagery) ----------

function renderEliminatedV1({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  // V1 — somber dark slate with a desaturated team block and a red
  // diagonal "OUT" stamp. No funeral imagery.
  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0b1220 100%)',
        color: '#e2e8f0',
        fontFamily: 'sans-serif',
        padding: '48px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', background: '#ef4444', color: '#fff', fontWeight: 900, padding: '10px 22px', borderRadius: '6px', fontSize: '24px', letterSpacing: '3px' }}>
          ELIMINATED
        </div>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '20px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '40px', marginTop: 'auto', marginBottom: 'auto', position: 'relative' }}>
        <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={220} ring="#475569aa" fallback={ctx.team.shortName} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '88px', fontWeight: 900, lineHeight: 1, color: '#f1f5f9' }}>{ctx.team.name}</div>
          <div style={{ fontSize: '34px', fontWeight: 700, color: '#fca5a5', marginTop: '14px', lineHeight: 1.05 }}>out of the World Cup</div>
          <div style={{ fontSize: '22px', color: '#94a3b8', marginTop: '14px' }}>{subline(ctx)}</div>
        </div>
        {/* Diagonal OUT stamp */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: '40px',
            top: '20px',
            transform: 'rotate(-14deg)',
            border: '6px solid #ef4444',
            color: '#ef4444',
            padding: '6px 28px',
            fontSize: '64px',
            fontWeight: 900,
            letterSpacing: '8px',
            opacity: 0.85,
          }}
        >
          OUT
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', color: '#94a3b8', fontSize: '22px' }}>
          Group stage exit • Thanks for the ride
        </div>
        <div style={{ display: 'flex', color: '#475569', fontSize: '20px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

function renderEliminatedV2({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  // V2 — bold flag panel desaturated to grayscale, red banner across the
  // top, standings on the right.
  const standing = ctx.standings.find(s => s.teamName === ctx.team.name);
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
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', width: '520px', height: '675px', alignItems: 'center', justifyContent: 'center', background: '#0f172a', position: 'relative' }}>
        {/* Wrapper applies grayscale via filter (next/og supports filter) */}
        <div style={{ display: 'flex', filter: 'grayscale(0.85) brightness(0.85)' }}>
          <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={420} ring="#7f1d1d99" fallback={ctx.team.shortName} />
        </div>
      </div>

      {/* Red diagonal banner across the top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '60px',
          left: '-40px',
          transform: 'rotate(-12deg)',
          background: '#dc2626',
          color: '#fff',
          padding: '10px 80px',
          fontWeight: 900,
          fontSize: '26px',
          letterSpacing: '6px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
        }}
      >
        ELIMINATED
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '120px 56px 40px 36px' }}>
        <div style={{ display: 'flex', fontSize: '76px', fontWeight: 900, lineHeight: 1, color: '#f8fafc' }}>{ctx.team.name}</div>
        <div style={{ display: 'flex', fontSize: '32px', color: '#fca5a5', marginTop: '14px', fontWeight: 600 }}>
          packs the bags after the group stage
        </div>
        {standing && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: '6px' }}>
            <div style={{ display: 'flex', fontSize: '20px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Final group standing</div>
            <div style={{ display: 'flex', fontSize: '40px', fontWeight: 800, color: '#f1f5f9' }}>
              #{standing.position} · {standing.points} pts · {standing.goalDifference >= 0 ? '+' : ''}{standing.goalDifference} GD
            </div>
          </div>
        )}
        <div style={{ display: 'flex', fontSize: '20px', color: '#cbd5e1', marginTop: '14px' }}>{subline(ctx)}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', color: '#475569', fontSize: '18px', letterSpacing: '1px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

function renderEliminatedV3({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  // V3 — clean white card with a giant 0% number and the bad news
  // headline. Stat-focused, mirrors the standard V3 style.
  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #fef2f2 0%, #ffffff 100%)',
        color: '#0f172a',
        fontFamily: 'sans-serif',
        padding: '48px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', background: '#dc2626', color: '#fff', fontWeight: 800, padding: '8px 18px', borderRadius: '999px', fontSize: '22px', letterSpacing: '2px' }}>
          ELIMINATED
        </div>
        <div style={{ display: 'flex', color: '#475569', fontSize: '22px' }}>
          Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginTop: '36px' }}>
        <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={120} ring="#dc262633" fallback={ctx.team.shortName} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1 }}>{ctx.team.name}</div>
          <div style={{ fontSize: '28px', color: '#b91c1c', marginTop: '10px', fontWeight: 600 }}>cannot reach the Round of 32</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '28px' }}>
        <div style={{ display: 'flex', fontSize: '20px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Advance probability</div>
        <div style={{ display: 'flex', fontSize: '180px', fontWeight: 900, color: '#dc2626', lineHeight: 1, marginTop: '6px' }}>0%</div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: 'auto' }}>
        <div style={{ display: 'flex', flex: 1, padding: '14px 22px', borderRadius: '10px', background: '#fee2e2', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: '18px', color: '#7f1d1d', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Status</div>
          <div style={{ display: 'flex', fontSize: '28px', fontWeight: 800, color: '#7f1d1d' }}>Out of the tournament</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '18px', letterSpacing: '1px', paddingLeft: '6px' }}>knockouts.in</div>
      </div>
    </div>
  );
}

// ============================================================
// STANDARD LAYOUTS — shown when no milestone is reached
// ============================================================

function pct(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

function posterStats(ctx: PreMatchContext | PostMatchContext) {
  return [
    {
      label: 'Qualify',
      value: ctx.probabilities.advance + ctx.probabilities.thirdPlay,
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.18)',
    },
    {
      label: '2nd place',
      value: ctx.positionProbs[2] ?? 0,
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.18)',
    },
    {
      label: 'Out',
      value: ctx.probabilities.eliminated,
      color: '#fb7185',
      bg: 'rgba(251,113,133,0.18)',
    },
  ];
}

function PosterBackground({
  ctx,
  flagDataUrl,
  flagSquareDataUrl,
  side = 'right',
  opacity = 0.16,
}: {
  ctx: PreMatchContext | PostMatchContext;
  flagDataUrl: string | null;
  flagSquareDataUrl?: string | null;
  side?: 'left' | 'right';
  opacity?: number;
}) {
  const src = flagDataUrl ?? flagSquareDataUrl;
  return (
    <div style={{ display: 'flex', position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {src ? (
        <img
          src={src}
          alt=""
          width={900}
          height={675}
          style={{
            position: 'absolute',
            left: side === 'left' ? '-180px' : '520px',
            top: '-70px',
            width: '860px',
            height: '820px',
            objectFit: 'cover',
            opacity,
            filter: 'blur(10px) saturate(1.25)',
            transform: side === 'left' ? 'rotate(-8deg) scale(1.08)' : 'rotate(8deg) scale(1.08)',
          }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: '-40px',
            top: '54px',
            fontSize: '210px',
            fontWeight: 950,
            lineHeight: 0.86,
            color: 'rgba(255,255,255,0.08)',
            letterSpacing: '-8px',
          }}
        >
          {ctx.team.shortName}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: side === 'right' ? '-36px' : undefined,
          left: side === 'left' ? '-36px' : undefined,
          top: '42px',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: '112px',
          fontWeight: 950,
          lineHeight: 0.9,
          letterSpacing: '-4px',
          color: 'rgba(255,255,255,0.13)',
          textTransform: 'uppercase',
        }}
      >
        {ctx.team.name}
      </div>
    </div>
  );
}

function BigStatCard({
  label,
  value,
  color,
  bg,
  compact = false,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 1,
        minHeight: compact ? '160px' : '210px',
        padding: compact ? '20px 22px' : '24px 28px',
        borderRadius: compact ? '22px' : '28px',
        background: bg,
        border: `1px solid ${color}77`,
        boxShadow: `0 18px 50px ${color}20`,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: compact ? '18px' : '20px',
          fontWeight: 850,
          color: '#e5e7eb',
          textTransform: 'uppercase',
          letterSpacing: '2px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: compact ? '62px' : '82px',
          fontWeight: 950,
          lineHeight: 0.92,
          color,
          letterSpacing: '-4px',
        }}
      >
        {pct(value)}
      </div>
    </div>
  );
}

function MatchWidget({
  ctx,
  opponentFlagDataUrl,
  opponentFlagSquareDataUrl,
  tone = 'dark',
}: {
  ctx: PreMatchContext | PostMatchContext;
  opponentFlagDataUrl?: string | null;
  opponentFlagSquareDataUrl?: string | null;
  tone?: 'dark' | 'light';
}) {
  const isPre = ctx.kind === 'pre';
  const label = isPre ? 'Next match' : 'Last match';
  const detail = isPre
    ? formatKickOff(ctx.nextMatch.kickOff)
    : `Round ${ctx.lastMatch.round} • ${ctx.result.toUpperCase()}`;
  const score = isPre ? 'VS' : ctx.scoreLineFor;
  const surface = tone === 'light' ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.08)';
  const text = tone === 'light' ? '#0f172a' : '#f8fafc';
  const muted = tone === 'light' ? '#475569' : '#94a3b8';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '18px',
        padding: '16px 20px',
        borderRadius: '22px',
        background: surface,
        border: `1px solid ${tone === 'light' ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.14)'}`,
      }}
    >
      <FlagCircle
        flagDataUrl={opponentFlagDataUrl ?? null}
        flagSquareDataUrl={opponentFlagSquareDataUrl}
        size={72}
        ring={tone === 'light' ? '#0f172a22' : '#ffffff22'}
        fallback={ctx.opponent.shortName}
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', fontSize: '16px', color: muted, textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800 }}>
          {label}
        </div>
        <div style={{ display: 'flex', fontSize: '30px', color: text, fontWeight: 900, lineHeight: 1.05, marginTop: '4px' }}>
          {ctx.opponent.name}
        </div>
        <div style={{ display: 'flex', fontSize: '18px', color: muted, marginTop: '4px' }}>
          {detail}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '104px',
          height: '78px',
          borderRadius: '18px',
          background: tone === 'light' ? '#0f172a' : '#f8fafc',
          color: tone === 'light' ? '#f8fafc' : '#0f172a',
          fontSize: isPre ? '28px' : '34px',
          fontWeight: 950,
          letterSpacing: isPre ? '3px' : '-1px',
        }}
      >
        {score}
      </div>
    </div>
  );
}

function renderV1({ ctx, flagDataUrl, flagSquareDataUrl, opponentFlagDataUrl, opponentFlagSquareDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const accent = isPre ? '#60a5fa' : '#f97316';
  const stats = posterStats(ctx);

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 18% 12%, rgba(96,165,250,0.32) 0%, transparent 30%), linear-gradient(135deg, #050816 0%, #111827 48%, #020617 100%)',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: '48px',
      }}
    >
      <PosterBackground ctx={ctx} flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} side="right" opacity={0.18} />
      <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(2,6,23,0.98) 0%, rgba(2,6,23,0.78) 52%, rgba(2,6,23,0.52) 100%)' }} />

      <div style={{ display: 'flex', position: 'relative', zIndex: 1, flexDirection: 'column', width: '100%', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', color: accent, fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px' }}>
              {isPre ? 'Pre-match outlook' : 'Post-match outlook'}
            </div>
            <div style={{ display: 'flex', fontSize: '92px', fontWeight: 950, lineHeight: 0.92, letterSpacing: '-5px', marginTop: '10px', maxWidth: '720px' }}>
              {ctx.team.name}
            </div>
            <div style={{ display: 'flex', color: '#cbd5e1', fontSize: '24px', marginTop: '14px' }}>
              Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} matches played
            </div>
          </div>
          <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={118} ring={`${accent}66`} fallback={ctx.team.shortName} />
        </div>

        <div style={{ display: 'flex', gap: '18px', marginTop: '44px' }}>
          {stats.map((s) => <BigStatCard key={s.label} {...s} />)}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', marginTop: 'auto' }}>
          <MatchWidget ctx={ctx} opponentFlagDataUrl={opponentFlagDataUrl} opponentFlagSquareDataUrl={opponentFlagSquareDataUrl} />
          <div style={{ display: 'flex', color: '#64748b', fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            knockouts.in
          </div>
        </div>
      </div>
    </div>
  );
}

function renderV2({ ctx, flagDataUrl, flagSquareDataUrl, opponentFlagDataUrl, opponentFlagSquareDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const accent = isPre ? '#facc15' : '#fb7185';
  const stats = posterStats(ctx);

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(120deg, #111827 0%, #312e81 54%, #581c87 100%)',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: '44px',
      }}
    >
      <PosterBackground ctx={ctx} flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} side="left" opacity={0.22} />
      <div style={{ display: 'flex', position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(17,24,39,0.64), rgba(17,24,39,0.94) 48%, rgba(17,24,39,0.72))' }} />

      <div style={{ display: 'flex', position: 'relative', zIndex: 1, width: '100%', height: '100%', gap: '34px' }}>
        <div style={{ display: 'flex', width: '380px', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', width: '120px', height: '10px', background: accent, borderRadius: '999px' }} />
            <div style={{ display: 'flex', fontSize: '34px', color: '#d1d5db', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '3px', marginTop: '26px' }}>
              {isPre ? 'Before kick-off' : 'After the whistle'}
            </div>
            <div style={{ display: 'flex', fontSize: '76px', fontWeight: 950, lineHeight: 0.92, letterSpacing: '-5px', marginTop: '12px' }}>
              {ctx.team.name}
            </div>
          </div>
          <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={190} ring={`${accent}66`} fallback={ctx.team.shortName} />
        </div>

        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', color: '#cbd5e1', fontSize: '22px' }}>
              Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} matches played
            </div>
            <div style={{ display: 'flex', color: '#cbd5e1', fontSize: '18px', textTransform: 'uppercase', letterSpacing: '2px' }}>
              knockouts.in
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '34px' }}>
            {stats.map((s) => <BigStatCard key={s.label} {...s} compact />)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: 'auto' }}>
            {stats.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', width: '140px', color: '#e5e7eb', fontSize: '18px', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  {s.label}
                </div>
                <div style={{ display: 'flex', flex: 1, height: '18px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', width: `${Math.max(2, Math.min(100, s.value))}%`, height: '100%', borderRadius: '999px', background: s.color }} />
                </div>
                <div style={{ display: 'flex', width: '110px', justifyContent: 'flex-end', color: s.color, fontSize: '28px', fontWeight: 950 }}>
                  {pct(s.value)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', marginTop: '28px' }}>
            <MatchWidget ctx={ctx} opponentFlagDataUrl={opponentFlagDataUrl} opponentFlagSquareDataUrl={opponentFlagSquareDataUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderV3({ ctx, flagDataUrl, flagSquareDataUrl, opponentFlagDataUrl, opponentFlagSquareDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const headline = isPre ? 'Upcoming' : 'Result';
  const accent = isPre ? '#2563eb' : '#e11d48';
  const stats = posterStats(ctx);
  const detail = isPre
    ? formatKickOff(ctx.nextMatch.kickOff)
    : `Round ${ctx.lastMatch.round}`;

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #f1f5f9 100%)',
        color: '#0f172a',
        fontFamily: 'sans-serif',
        padding: '48px',
      }}
    >
      {flagDataUrl && (
        <img
          src={flagDataUrl}
          alt=""
          width={840}
          height={630}
          style={{
            position: 'absolute',
            right: '-150px',
            top: '-80px',
            width: '820px',
            height: '760px',
            objectFit: 'cover',
            opacity: 0.16,
            filter: 'blur(9px) saturate(1.35)',
            transform: 'rotate(8deg)',
          }}
        />
      )}
      <div style={{ display: 'flex', position: 'absolute', right: '-20px', top: '46px', writingMode: 'vertical-rl', fontSize: '104px', fontWeight: 950, lineHeight: 0.9, letterSpacing: '-5px', textTransform: 'uppercase', color: 'rgba(15,23,42,0.10)' }}>
        {ctx.team.name}
      </div>

      <div style={{ display: 'flex', position: 'relative', zIndex: 1, flexDirection: 'column', width: '100%', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={104} ring={`${accent}33`} fallback={ctx.team.shortName} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: '20px', color: accent, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '3px' }}>{headline}</div>
              <div style={{ display: 'flex', fontSize: '66px', fontWeight: 950, lineHeight: 0.95, letterSpacing: '-4px' }}>{ctx.team.name}</div>
            </div>
          </div>
          <div style={{ display: 'flex', color: '#475569', fontSize: '22px' }}>
            Group {ctx.group.groupId} • {detail}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '18px', marginTop: '46px' }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '24px',
                borderRadius: '30px',
                background: '#ffffff',
                border: '1px solid rgba(15,23,42,0.10)',
                boxShadow: '0 24px 70px rgba(15,23,42,0.10)',
              }}
            >
              <div style={{ display: 'flex', width: '54px', height: '8px', background: s.color, borderRadius: '999px' }} />
              <div style={{ display: 'flex', color: '#475569', fontSize: '18px', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '2px', marginTop: '22px' }}>{s.label}</div>
              <div style={{ display: 'flex', color: s.color, fontSize: '88px', fontWeight: 950, lineHeight: 0.92, letterSpacing: '-5px', marginTop: '14px' }}>{pct(s.value)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', marginTop: 'auto' }}>
          <MatchWidget ctx={ctx} opponentFlagDataUrl={opponentFlagDataUrl} opponentFlagSquareDataUrl={opponentFlagSquareDataUrl} tone="light" />
          <div style={{ display: 'flex', color: '#64748b', fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            knockouts.in
          </div>
        </div>
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
  if (milestone === 'clinched') {
    if (variant === 2) return renderClinchedV2(props);
    if (variant === 3) return renderClinchedV3(props);
    return renderClinchedV1(props);
  }
  if (milestone === 'eliminated') {
    if (variant === 2) return renderEliminatedV2(props);
    if (variant === 3) return renderEliminatedV3(props);
    return renderEliminatedV1(props);
  }

  if (variant === 2) return renderV2(props);
  if (variant === 3) return renderV3(props);
  return renderV1(props);
}
