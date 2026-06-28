'use client';

import { useMemo, useState } from 'react';
import { useHasMounted } from '@/lib/use-has-mounted';
import PlayoffTipsTab, { type PlayoffTipRow, type PlayoffPickRow } from './PlayoffTipsTab';
import StageToggle from './StageToggle';

export interface TipRow {
  id: number;
  tipsterName: string;
  homeShort: string;
  homeCc: string;
  awayShort: string;
  awayCc: string;
  tipHome: number;
  tipAway: number;
  resultHome: number | null;
  resultAway: number | null;
  finished: boolean;
  points: number | null;
  createdAt: string; // ISO 8601 (UTC)
}

// Local-timezone YYYY-MM-DD, used both as the grouping key and for sorting.
// Tips arrive newest-first from the server, so local-day order stays
// newest-first too (local day is monotonic with absolute time).
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

// Scoring: 4 = exact score, 1 = correct outcome, 0 = wrong.
function pointsColor(points: number): string {
  if (points >= 4) return '#37b24d';
  if (points >= 1) return 'var(--wc-accent)';
  return 'var(--wc-text-muted)';
}

function pointsLabel(points: number): string {
  return points > 0 ? `+${points}` : '0';
}

export default function TipsTab({
  tips,
  playoffTips = [],
  playoffPicks = [],
  playoffEnabled = false,
}: {
  tips: TipRow[];
  playoffTips?: PlayoffTipRow[];
  playoffPicks?: PlayoffPickRow[];
  playoffEnabled?: boolean;
}) {
  // Dates are formatted in the admin's local timezone, which differs from the
  // server's — gate on mount so the grouped markup is client-only and can't
  // trigger a hydration mismatch.
  const mounted = useHasMounted();
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  // Default to the play-off view when the bracket is live; otherwise group only.
  const [view, setView] = useState<'group' | 'playoff'>(playoffEnabled ? 'playoff' : 'group');

  const groups = useMemo(() => {
    const map = new Map<string, TipRow[]>();
    for (const t of tips) {
      const key = dayKey(t.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [tips]);

  if (!mounted) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>Loading…</p>;
  }

  const toggleDay = (key: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const stageSwitch = playoffEnabled ? <StageToggle value={view} onChange={setView} /> : null;

  if (playoffEnabled && view === 'playoff') {
    return (
      <div className="d-flex flex-column gap-3">
        {stageSwitch}
        <PlayoffTipsTab tips={playoffTips} picks={playoffPicks} />
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      {stageSwitch}
      {tips.length === 0 ? (
        <p style={{ color: 'var(--wc-text-muted)' }}>No tips have been placed yet.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {groups.map(([key, rows]) => {
        const isOpen = openDays.has(key);
        return (
          <div
            key={key}
            style={{
              border: '1px solid var(--wc-border)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => toggleDay(key)}
              className="d-flex align-items-center justify-content-between w-100"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: 'none',
                color: 'var(--wc-text)',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span className="d-flex align-items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                >
                  ▸
                </span>
                <span style={{ fontWeight: 600 }}>{formatDayLabel(rows[0].createdAt)}</span>
              </span>
              <span style={{ color: 'var(--wc-accent)', fontWeight: 600, fontSize: '0.9rem' }}>
                {rows.length} {rows.length === 1 ? 'tip' : 'tips'}
              </span>
            </button>

            {isOpen && (
              <div>
                {rows.map((t) => (
                  <div
                    key={t.id}
                    className="d-flex align-items-center justify-content-between gap-3"
                    style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--wc-border)' }}
                  >
                    {/* Tipster + match */}
                    <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                      <span style={{ color: 'var(--wc-text)' }}>{t.tipsterName || '(no name)'}</span>
                      <span
                        className="d-flex align-items-center gap-1"
                        style={{ color: 'var(--wc-text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                      >
                        <FlagIcon code={t.homeCc} />
                        <span>{t.homeShort}</span>
                        <span style={{ opacity: 0.6 }}>vs</span>
                        <span>{t.awayShort}</span>
                        <FlagIcon code={t.awayCc} />
                      </span>
                    </div>

                    {/* Tip + result + points */}
                    <div
                      className="d-flex align-items-center gap-3"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      <span className="d-flex flex-column align-items-end">
                        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.72rem' }}>Tip</span>
                        <span style={{ color: 'var(--wc-text)', fontWeight: 600 }}>
                          {t.tipHome}:{t.tipAway}
                        </span>
                      </span>

                      {t.finished && t.resultHome !== null && t.resultAway !== null ? (
                        <>
                          <span className="d-flex flex-column align-items-end">
                            <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.72rem' }}>Result</span>
                            <span style={{ color: 'var(--wc-text)', fontWeight: 600 }}>
                              {t.resultHome}:{t.resultAway}
                            </span>
                          </span>
                          {t.points !== null && (
                            <span
                              style={{
                                color: pointsColor(t.points),
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                minWidth: '2.2rem',
                                textAlign: 'right',
                              }}
                            >
                              {pointsLabel(t.points)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>
                          {formatTime(t.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
          })}
        </div>
      )}
    </div>
  );
}
