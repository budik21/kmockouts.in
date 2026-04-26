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
  if ((ctx.positionProbs[4] ?? 0) >= 99.5) return 'eliminated';
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

function MilestonePoster({
  ctx,
  flagDataUrl,
  flagSquareDataUrl,
  kind,
  variant,
}: OgRenderProps & { kind: 'clinched' | 'eliminated'; variant: OgVariant }) {
  const isClinched = kind === 'clinched';
  const dark = variant !== 3 || isClinched;
  const standing = ctx.standings.find(s => s.teamName === ctx.team.name);
  const accent = isClinched ? '#facc15' : '#ef4444';
  const headline = isClinched ? 'PLAY-OFF SECURED' : variant === 2 ? 'OUT!' : 'ELIMINATED!';
  const status = isClinched ? 'Round of 32 guaranteed' : 'World Cup run ends here';
  const background = isClinched
    ? variant === 1
      ? 'radial-gradient(circle at 20% 15%, rgba(250,204,21,0.34), transparent 30%), linear-gradient(135deg, #052e16 0%, #064e3b 50%, #111827 100%)'
      : variant === 2
        ? 'linear-gradient(120deg, #022c22 0%, #14532d 45%, #422006 100%)'
        : 'radial-gradient(circle at 18% 12%, rgba(250,204,21,0.38), transparent 30%), radial-gradient(circle at 78% 18%, rgba(34,197,94,0.28), transparent 28%), linear-gradient(135deg, #022c22 0%, #14532d 52%, #111827 100%)'
    : variant === 1
      ? 'radial-gradient(circle at 24% 10%, rgba(239,68,68,0.34), transparent 28%), linear-gradient(135deg, #111827 0%, #450a0a 58%, #0b1220 100%)'
      : variant === 2
        ? 'linear-gradient(120deg, #450a0a 0%, #991b1b 46%, #111827 100%)'
        : 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 56%, #991b1b 100%)';
  const textColor = dark || !isClinched ? '#f8fafc' : '#0f172a';
  const mutedColor = dark || !isClinched ? '#cbd5e1' : '#475569';
  const flagOpacity = variant === 3 && isClinched ? 0.32 : isClinched ? 0.22 : 0.16;
  const bigWord = isClinched ? 'THROUGH' : 'OUT';
  const sparks = isClinched
    ? [
      { l: '8%', t: '12%', c: '#fde047', s: 14 },
      { l: '18%', t: '76%', c: '#22c55e', s: 10 },
      { l: '34%', t: '8%', c: '#facc15', s: 12 },
      { l: '58%', t: '20%', c: '#34d399', s: 16 },
      { l: '78%', t: '72%', c: '#fde047', s: 12 },
      { l: '90%', t: '16%', c: '#22c55e', s: 10 },
      { l: '44%', t: '88%', c: '#f97316', s: 8 },
      { l: '68%', t: '90%', c: '#34d399', s: 14 },
    ]
    : [
      { l: '10%', t: '18%', c: '#fecaca', s: 10 },
      { l: '24%', t: '82%', c: '#ef4444', s: 12 },
      { l: '52%', t: '12%', c: '#f87171', s: 8 },
      { l: '84%', t: '74%', c: '#fee2e2', s: 14 },
    ];

  return (
    <div
      style={{
        width: '1200px',
        height: '675px',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background,
        color: textColor,
        fontFamily: 'sans-serif',
        padding: variant === 3 ? '42px 48px' : '48px',
      }}
    >
      <PosterBackground
        ctx={ctx}
        flagDataUrl={flagDataUrl}
        flagSquareDataUrl={flagSquareDataUrl}
        side={variant === 2 ? 'left' : 'right'}
        opacity={flagOpacity}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          inset: 0,
          background: isClinched
            ? dark
              ? 'linear-gradient(90deg, rgba(2,44,34,0.94), rgba(20,83,45,0.66), rgba(2,6,23,0.32))'
              : 'linear-gradient(90deg, rgba(254,252,232,0.92), rgba(255,255,255,0.68))'
            : 'linear-gradient(90deg, rgba(69,10,10,0.96), rgba(127,29,29,0.76), rgba(15,23,42,0.48))',
        }}
      />
      <div style={{ display: 'flex', position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {sparks.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: d.l,
              top: d.t,
              width: `${d.s}px`,
              height: `${d.s}px`,
              borderRadius: '999px',
              background: d.c,
              opacity: isClinched ? 0.82 : 0.34,
              ...(isClinched ? { boxShadow: `0 0 28px ${d.c}` } : {}),
            }}
          />
        ))}
        {isClinched && [0, 1, 2].map((i) => (
          <div
            key={`firework-${i}`}
            style={{
              display: 'flex',
              position: 'absolute',
              right: `${90 + i * 145}px`,
              top: `${58 + i * 34}px`,
              width: `${118 - i * 16}px`,
              height: `${118 - i * 16}px`,
              borderRadius: '999px',
              border: `5px solid ${i === 1 ? '#22c55e' : '#fde047'}`,
              opacity: 0.28,
              boxShadow: `0 0 34px ${i === 1 ? '#22c55e' : '#fde047'}`,
            }}
          />
        ))}
      </div>

      {!isClinched && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            inset: '0 0 auto 0',
            height: '210px',
            background: '#dc2626',
            transform: variant === 2 ? 'rotate(-4deg) translateY(-38px)' : 'rotate(-2deg) translateY(-44px)',
            boxShadow: '0 22px 50px rgba(0,0,0,0.35)',
          }}
        />
      )}

      <div style={{ display: 'flex', position: 'relative', zIndex: 1, flexDirection: 'column', width: '100%', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: variant === 2 ? '760px' : '820px' }}>
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                background: isClinched ? accent : '#ffffff',
                color: isClinched ? '#422006' : '#b91c1c',
                fontSize: '24px',
                fontWeight: 950,
                letterSpacing: '3px',
                padding: '10px 22px',
                borderRadius: isClinched ? '999px' : '8px',
                textTransform: 'uppercase',
              }}
            >
              {headline}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: variant === 3 ? '84px' : '98px',
                fontWeight: 950,
                lineHeight: 0.88,
                letterSpacing: '-5px',
                marginTop: '24px',
                color: textColor,
              }}
            >
              {ctx.team.name}
            </div>
            <div style={{ display: 'flex', fontSize: '34px', color: isClinched ? accent : '#ffffff', fontWeight: 900, marginTop: '18px' }}>
              {status}
            </div>
          </div>
          <FlagCircle
            flagDataUrl={flagDataUrl}
            flagSquareDataUrl={flagSquareDataUrl}
            size={variant === 2 ? 170 : 132}
            ring={isClinched ? `${accent}77` : '#ffffff55'}
            fallback={ctx.team.shortName}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              fontSize: isClinched ? '130px' : '150px',
              fontWeight: 950,
              lineHeight: 0.82,
              letterSpacing: '-7px',
              color: isClinched ? accent : '#ffffff',
              textTransform: 'uppercase',
              ...(dark || !isClinched ? { textShadow: '0 18px 50px rgba(0,0,0,0.36)' } : {}),
            }}
          >
            {bigWord}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
            <div style={{ display: 'flex', color: mutedColor, fontSize: '22px' }}>
              Group {ctx.group.groupId} • {ctx.group.matchesPlayed}/{ctx.group.matchesTotal} matches played
            </div>
            {standing && (
              <div style={{ display: 'flex', color: textColor, fontSize: '34px', fontWeight: 900 }}>
                #{standing.position} · {standing.points} pts · {standing.goalDifference >= 0 ? '+' : ''}{standing.goalDifference} GD
              </div>
            )}
            <div style={{ display: 'flex', color: mutedColor, fontSize: '21px' }}>{subline(ctx)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
          <div style={{ display: 'flex', color: isClinched ? (dark ? '#bbf7d0' : '#166534') : '#fee2e2', fontSize: '22px', fontWeight: 800 }}>
            {isClinched ? 'Mathematically guaranteed' : 'Mathematically eliminated'}
          </div>
          <div style={{ display: 'flex', color: dark || !isClinched ? '#cbd5e1' : '#64748b', fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            knockouts.in
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- CLINCHED ----------

function renderClinchedV1(props: OgRenderProps) {
  return <MilestonePoster {...props} kind="clinched" variant={1} />;
}

function renderClinchedV2(props: OgRenderProps) {
  return <MilestonePoster {...props} kind="clinched" variant={2} />;
}

function renderClinchedV3(props: OgRenderProps) {
  return <MilestonePoster {...props} kind="clinched" variant={3} />;
}

// ---------- ELIMINATED (no RIP / no graveyard imagery) ----------

function renderEliminatedV1(props: OgRenderProps) {
  return <MilestonePoster {...props} kind="eliminated" variant={1} />;
}

function renderEliminatedV2(props: OgRenderProps) {
  return <MilestonePoster {...props} kind="eliminated" variant={2} />;
}

function renderEliminatedV3(props: OgRenderProps) {
  return <MilestonePoster {...props} kind="eliminated" variant={3} />;
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
          ...(side === 'right' ? { right: '-80px' } : { left: '-80px' }),
          bottom: '32px',
          fontSize: '132px',
          fontWeight: 950,
          lineHeight: 0.85,
          letterSpacing: '-7px',
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
        width: '100%',
        padding: '12px 18px',
        borderRadius: '18px',
        background: surface,
        border: `1px solid ${tone === 'light' ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.14)'}`,
      }}
    >
      <FlagCircle
        flagDataUrl={opponentFlagDataUrl ?? null}
        flagSquareDataUrl={opponentFlagSquareDataUrl}
        size={58}
        ring={tone === 'light' ? '#0f172a22' : '#ffffff22'}
        fallback={ctx.opponent.shortName}
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', fontSize: '14px', color: muted, textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800 }}>
          {label}
        </div>
        <div style={{ display: 'flex', fontSize: '26px', color: text, fontWeight: 900, lineHeight: 1.05, marginTop: '2px' }}>
          {ctx.opponent.name}
        </div>
        <div style={{ display: 'flex', fontSize: '16px', color: muted, marginTop: '2px' }}>
          {detail}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '94px',
          height: '62px',
          borderRadius: '14px',
          background: tone === 'light' ? '#0f172a' : '#f8fafc',
          color: tone === 'light' ? '#f8fafc' : '#0f172a',
          fontSize: isPre ? '25px' : '30px',
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
          <MatchWidget ctx={ctx} opponentFlagDataUrl={opponentFlagDataUrl} opponentFlagSquareDataUrl={opponentFlagSquareDataUrl} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', color: '#64748b', fontSize: '16px', letterSpacing: '2px', textTransform: 'uppercase' }}>
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

          <div style={{ display: 'flex', marginTop: '22px' }}>
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
        padding: '40px 44px',
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
      <div style={{ display: 'flex', position: 'absolute', right: '-20px', top: '46px', writingMode: 'vertical-rl', fontSize: '96px', fontWeight: 950, lineHeight: 0.9, letterSpacing: '-5px', textTransform: 'uppercase', color: 'rgba(15,23,42,0.10)' }}>
        {ctx.team.name}
      </div>

      <div style={{ display: 'flex', position: 'relative', zIndex: 1, flexDirection: 'column', width: '100%', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <FlagCircle flagDataUrl={flagDataUrl} flagSquareDataUrl={flagSquareDataUrl} size={104} ring={`${accent}33`} fallback={ctx.team.shortName} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: '18px', color: accent, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '3px' }}>{headline}</div>
              <div style={{ display: 'flex', fontSize: '58px', fontWeight: 950, lineHeight: 0.95, letterSpacing: '-4px' }}>{ctx.team.name}</div>
            </div>
          </div>
          <div style={{ display: 'flex', color: '#475569', fontSize: '22px' }}>
            Group {ctx.group.groupId} • {detail}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '18px', marginTop: '34px' }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '28px',
                borderRadius: '30px',
                background: '#ffffff',
                border: '1px solid rgba(15,23,42,0.10)',
                boxShadow: '0 24px 70px rgba(15,23,42,0.10)',
              }}
            >
              <div style={{ display: 'flex', width: '54px', height: '8px', background: s.color, borderRadius: '999px' }} />
              <div style={{ display: 'flex', color: '#475569', fontSize: '18px', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '2px', marginTop: '24px' }}>{s.label}</div>
              <div style={{ display: 'flex', color: s.color, fontSize: '100px', fontWeight: 950, lineHeight: 0.92, letterSpacing: '-6px', marginTop: '16px' }}>{pct(s.value)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
          <MatchWidget ctx={ctx} opponentFlagDataUrl={opponentFlagDataUrl} opponentFlagSquareDataUrl={opponentFlagSquareDataUrl} tone="light" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', color: '#64748b', fontSize: '15px', letterSpacing: '2px', textTransform: 'uppercase' }}>
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
