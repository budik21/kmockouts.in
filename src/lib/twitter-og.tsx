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

function renderV1({ ctx, flagDataUrl, flagSquareDataUrl }: OgRenderProps) {
  const isPre = ctx.kind === 'pre';
  const accent = isPre ? '#3b82f6' : '#ef4444';
  const probs = probTriple(ctx);

  // Footer meta: very subtle line with the previous result + group round + venue + kickoff.
  // Pre-match: shows the upcoming fixture meta. Post-match: shows the just-played match.
  const matchForMeta = isPre ? ctx.nextMatch : ctx.lastMatch;
  const roundLabel = `Group ${ctx.group.groupId} match ${matchForMeta.round}`;
  const venueLabel = matchForMeta.venue ? matchForMeta.venue : null;
  const timeLabel = formatKickOff(matchForMeta.kickOff);
  const resultLabel = isPre
    ? `vs ${ctx.opponent.shortName}`
    : `${ctx.team.shortName} ${ctx.scoreLineFor} ${ctx.opponent.shortName}`;
  const footerBits = [resultLabel, roundLabel, venueLabel, timeLabel].filter(Boolean) as string[];

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
        padding: '56px 56px 28px 56px',
      }}
    >
      {/* Main split — flag/team on the left, stacked probability widgets on the right. */}
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '40px' }}>
        {/* LEFT — prominent flag + team name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          <FlagCircle
            flagDataUrl={flagDataUrl}
            flagSquareDataUrl={flagSquareDataUrl}
            size={300}
            ring={`${accent}66`}
            fallback={ctx.team.shortName}
          />
          <div
            style={{
              display: 'flex',
              fontSize: '88px',
              fontWeight: 900,
              lineHeight: 1,
              color: '#f8fafc',
              marginTop: '28px',
              letterSpacing: '-1px',
            }}
          >
            {ctx.team.name}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '22px',
              color: '#94a3b8',
              marginTop: '10px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} played
          </div>
        </div>

        {/* RIGHT — three stacked probability cards, right-aligned */}
        <div style={{ display: 'flex', flexDirection: 'column', width: '460px', gap: '16px' }}>
          {probs.map((p) => (
            <div
              key={p.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                padding: '18px 26px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '14px',
                border: `1px solid ${p.color}55`,
                borderRight: `6px solid ${p.color}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '18px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                }}
              >
                {p.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '72px',
                  fontWeight: 900,
                  color: p.color,
                  lineHeight: 1,
                  marginTop: '4px',
                }}
              >
                {p.value.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER — small, decent meta line + branding */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '20px',
          paddingTop: '14px',
          borderTop: '1px solid rgba(148,163,184,0.18)',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#64748b',
            fontSize: '15px',
            letterSpacing: '0.5px',
          }}
        >
          {footerBits.join('  ·  ')}
        </div>
        <div
          style={{
            display: 'flex',
            color: '#475569',
            fontSize: '15px',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          knockouts.in
        </div>
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
        <div style={{ display: 'flex', fontSize: '20px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px' }}>Advance to Round of 32</div>
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
