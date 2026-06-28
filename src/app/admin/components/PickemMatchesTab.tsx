'use client';

import { useMemo, useState } from 'react';
import { useHasMounted } from '@/lib/use-has-mounted';
import { matchColors, DRAW_COLOR } from '@/lib/flag-colors';
import { buildInfographicPrompt, tipShares } from '@/lib/infographic-prompt';

/** Per-match tip distribution for a single fixture (group stage or knockout). */
export interface MatchTipStats {
  id: number;
  /** Group letter for the group stage, or the round label for a knockout tie. */
  groupId: string;
  round: number;
  kickOff: string; // ISO 8601 (UTC)
  homeName: string;
  homeShort: string;
  homeCc: string;
  awayName: string;
  awayShort: string;
  awayCc: string;
  totalTips: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  topScore: { homeGoals: number; awayGoals: number; count: number } | null;
  /** Which tournament stage this fixture belongs to. Defaults to the group stage. */
  stage?: 'group' | 'knockout';
}

// Local-timezone YYYY-MM-DD, used both as the grouping key and for sorting.
// Matches arrive chronologically from the server, so local-day order stays
// chronological too (local day is monotonic with absolute time).
function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Mirrors the FlagIcon used across the pickem views; relies on the global
// flag-icons CSS (already loaded for the admin MatchEditor).
function FlagIcon({ code }: { code: string }) {
  if (!code) return <span>?</span>;
  const cls = code.length > 2
    ? `fi fi-${code.slice(0, 2).toLowerCase()} fis fi-${code.toLowerCase()}`
    : `fi fi-${code.toLowerCase()}`;
  return <span className={`${cls} flag-sm`} />;
}

/** Three-segment home | draw | away distribution bar, dark-theme variant. */
function RatioBar({ m }: { m: MatchTipStats }) {
  const { home: homeColor, away: awayColor } = matchColors(m.homeCc, m.awayCc);
  const { homePct, drawPct, awayPct } = tipShares(m);

  if (m.totalTips === 0) {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
        <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.78rem', fontStyle: 'italic', marginTop: '0.35rem' }}>
          No tips placed yet.
        </div>
      </div>
    );
  }

  const seg = (pct: number, color: string) =>
    pct > 0 ? <div style={{ width: `${pct}%`, background: color }} /> : null;

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
        {seg(homePct, homeColor)}
        {seg(drawPct, DRAW_COLOR)}
        {seg(awayPct, awayColor)}
      </div>
      <div className="d-flex justify-content-between" style={{ fontSize: '0.78rem', color: 'var(--wc-text)', marginTop: '0.35rem' }}>
        <span>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: homeColor, marginRight: 5 }} />
          <strong>{m.homeShort} {homePct}%</strong>
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: DRAW_COLOR, marginRight: 5 }} />
          Draw {drawPct}%
        </span>
        <span>
          <strong>{awayPct}% {m.awayShort}</strong>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: awayColor, marginLeft: 5 }} />
        </span>
      </div>
    </div>
  );
}

function CopyPromptButton({ m }: { m: MatchTipStats }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const prompt = buildInfographicPrompt(m);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (insecure context / permissions). Fall back
      // to a hidden textarea + execCommand so the button still works.
      const ta = document.createElement('textarea');
      ta.value = prompt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Give up silently — nothing else we can do client-side.
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={m.totalTips === 0}
      title={m.totalTips === 0 ? 'No tips yet — nothing to visualise' : 'Copy the AI image prompt for this match'}
      className="btn btn-sm"
      style={{
        backgroundColor: copied ? '#37b24d' : 'var(--wc-surface)',
        color: copied ? '#fff' : 'var(--wc-text)',
        border: '1px solid var(--wc-border)',
        fontSize: '0.8rem',
        whiteSpace: 'nowrap',
        opacity: m.totalTips === 0 ? 0.5 : 1,
        cursor: m.totalTips === 0 ? 'not-allowed' : 'pointer',
      }}
    >
      {copied ? '✓ Copied' : 'Copy AI prompt'}
    </button>
  );
}

function MatchCard({ m, past }: { m: MatchTipStats; past: boolean }) {
  const topScore = m.topScore ? `${m.topScore.homeGoals}:${m.topScore.awayGoals}` : '—';

  return (
    <div
      style={{
        border: '1px solid var(--wc-border)',
        borderRadius: 6,
        padding: '0.75rem 1rem',
        background: 'rgba(255, 255, 255, 0.03)',
        // Played matches stay visible but are visually suppressed: dimmed and
        // desaturated so attention falls on upcoming fixtures.
        opacity: past ? 0.45 : 1,
        filter: past ? 'grayscale(0.85)' : 'none',
      }}
    >
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <span className="d-flex align-items-center gap-2" style={{ color: 'var(--wc-text)', minWidth: 0 }}>
          <FlagIcon code={m.homeCc} />
          <span style={{ fontWeight: 600 }}>{m.homeName}</span>
          <span style={{ opacity: 0.6 }}>vs</span>
          <span style={{ fontWeight: 600 }}>{m.awayName}</span>
          <FlagIcon code={m.awayCc} />
        </span>
        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {m.stage === 'knockout' ? m.groupId : `Group ${m.groupId}`} · {formatTime(m.kickOff)} · {m.totalTips} {m.totalTips === 1 ? 'tip' : 'tips'}
        </span>
      </div>

      <RatioBar m={m} />

      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2" style={{ marginTop: '0.6rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--wc-text-muted)' }}>
          Most tipped result:{' '}
          <strong style={{ color: 'var(--wc-text)' }}>{topScore}</strong>
          {m.topScore && (
            <span style={{ color: 'var(--wc-text-muted)' }}> ({m.topScore.count}× of {m.totalTips})</span>
          )}
        </span>
        <CopyPromptButton m={m} />
      </div>
    </div>
  );
}

export default function PickemMatchesTab({
  matches,
  playoffMatches = [],
  playoffEnabled = false,
}: {
  matches: MatchTipStats[];
  playoffMatches?: MatchTipStats[];
  playoffEnabled?: boolean;
}) {
  // Dates are formatted in the admin's local timezone; gate on mount so the
  // grouped markup is client-only and can't trigger a hydration mismatch.
  const mounted = useHasMounted();
  const [futureOnly, setFutureOnly] = useState(true);
  const [view, setView] = useState<'group' | 'playoff'>('group');

  const activeMatches = view === 'playoff' ? playoffMatches : matches;

  // A match counts as "played" once its kick-off time has passed.
  const isPast = (m: MatchTipStats) => new Date(m.kickOff).getTime() < Date.now();

  const groups = useMemo(() => {
    const map = new Map<string, MatchTipStats[]>();
    for (const m of activeMatches) {
      if (futureOnly && isPast(m)) continue;
      const key = dayKey(m.kickOff);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [activeMatches, futureOnly]);

  if (!mounted) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>Loading…</p>;
  }

  const stageSwitch = playoffEnabled ? (
    <div className="d-flex gap-2">
      {(['group', 'playoff'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className="btn btn-sm"
          style={{
            backgroundColor: view === v ? 'var(--wc-accent)' : 'var(--wc-surface)',
            color: view === v ? '#fff' : 'var(--wc-text)',
            border: '1px solid var(--wc-border)',
            fontSize: '0.8rem',
          }}
        >
          {v === 'group' ? 'Group stage' : 'Play-off'}
        </button>
      ))}
    </div>
  ) : null;

  const futureToggle = (
    <label
      className="d-flex align-items-center gap-2"
      style={{ color: 'var(--wc-text)', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}
    >
      <input
        type="checkbox"
        checked={futureOnly}
        onChange={(e) => setFutureOnly(e.target.checked)}
      />
      Show future matches only
    </label>
  );

  const controls = (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
      {futureToggle}
      {stageSwitch}
    </div>
  );

  if (activeMatches.length === 0) {
    return (
      <div className="d-flex flex-column gap-3">
        {controls}
        <p style={{ color: 'var(--wc-text-muted)' }}>
          {view === 'playoff'
            ? 'No play-off fixtures yet — run Sync in the Play-off tab to seed the bracket.'
            : 'No group-stage matches found.'}
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="d-flex flex-column gap-3">
        {controls}
        <p style={{ color: 'var(--wc-text-muted)' }}>No upcoming matches.</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-4">
      {controls}
      {groups.map(([key, rows]) => (
        <div key={key}>
          <h3 style={{ color: 'var(--wc-text)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {formatDayLabel(rows[0].kickOff)}
          </h3>
          <div className="d-flex flex-column gap-2">
            {rows.map((m) => (
              <MatchCard key={m.id} m={m} past={isPast(m)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
