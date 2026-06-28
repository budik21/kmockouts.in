'use client';

import { useMemo, useState } from 'react';
import { useHasMounted } from '@/lib/use-has-mounted';

/** A single per-match knockout tip (score + who advances). */
export interface PlayoffTipRow {
  id: number;
  tipsterName: string;
  shareToken: string | null;
  tipsPublic: boolean;
  matchNumber: number;
  roundLabel: string;
  homeShort: string | null;
  homeCc: string | null;
  awayShort: string | null;
  awayCc: string | null;
  tipHome: number;
  tipAway: number;
  advanceShort: string | null;
  advanceCc: string | null;
  finished: boolean;
  resultHome: number | null;
  resultAway: number | null;
  points: number | null;
  createdAt: string; // ISO 8601 (UTC)
}

/** One slot of a tipster's top-4 placement picks. */
export interface PlayoffPickRow {
  id: number;
  userId: number;
  tipsterName: string;
  shareToken: string | null;
  tipsPublic: boolean;
  slot: string; // champion | runner_up | third | fourth
  teamShort: string;
  teamCc: string;
  points: number | null;
  createdAt: string; // ISO 8601 (UTC)
}

// Local-timezone YYYY-MM-DD, used both as the grouping key and for sorting.
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
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Mirrors the FlagIcon used across the pickem views; relies on the global
// flag-icons CSS (already loaded for the admin MatchEditor).
function FlagIcon({ code }: { code: string | null }) {
  if (!code) return <span>?</span>;
  const cls = code.length > 2
    ? `fi fi-${code.slice(0, 2).toLowerCase()} fis fi-${code.toLowerCase()}`
    : `fi fi-${code.toLowerCase()}`;
  return <span className={`${cls} flag-sm`} />;
}

// Slot order + short labels for the top-4 picks.
const SLOT_ORDER = ['champion', 'runner_up', 'third', 'fourth'] as const;
const SLOT_BADGE: Record<string, string> = {
  champion: '🥇',
  runner_up: '🥈',
  third: '🥉',
  fourth: '4️⃣',
};

function pointsColor(points: number): string {
  if (points >= 8) return '#37b24d';
  if (points >= 1) return 'var(--wc-accent)';
  return 'var(--wc-text-muted)';
}

function pointsLabel(points: number): string {
  return points > 0 ? `+${points}` : '0';
}

/** Tipster name — links to their public play-off profile when sharing is on. */
function TipsterName({ name, shareToken, tipsPublic }: { name: string; shareToken: string | null; tipsPublic: boolean }) {
  const label = name || '(no name)';
  if (tipsPublic && shareToken) {
    return (
      <a
        href={`/pickem/share/${shareToken}`}
        target="_blank"
        rel="noreferrer"
        style={{ color: 'var(--wc-accent)', textDecoration: 'none' }}
        title="Open play-off profile"
      >
        {label} ↗
      </a>
    );
  }
  return (
    <span style={{ color: 'var(--wc-text)' }} title="Private profile — no public link">
      {label}
    </span>
  );
}

interface DayBucket {
  key: string;
  tips: PlayoffTipRow[];
  picks: PlayoffPickRow[];
}

export default function PlayoffTipsTab({ tips, picks }: { tips: PlayoffTipRow[]; picks: PlayoffPickRow[] }) {
  // Dates are formatted in the admin's local timezone — gate on mount so the
  // grouped markup is client-only and can't trigger a hydration mismatch.
  const mounted = useHasMounted();
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const buckets = useMemo<DayBucket[]>(() => {
    const map = new Map<string, DayBucket>();
    const bucket = (iso: string) => {
      const key = dayKey(iso);
      let b = map.get(key);
      if (!b) {
        b = { key, tips: [], picks: [] };
        map.set(key, b);
      }
      return b;
    };
    for (const t of tips) bucket(t.createdAt).tips.push(t);
    for (const p of picks) bucket(p.createdAt).picks.push(p);
    // Newest day first (dayKey is YYYY-MM-DD, so a string sort is chronological).
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [tips, picks]);

  if (!mounted) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>Loading…</p>;
  }

  if (tips.length === 0 && picks.length === 0) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>No play-off tips or top-4 picks have been placed yet.</p>;
  }

  const toggleDay = (key: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // The day-header sample date — both arrays carry createdAt, so either works.
  const sampleIso = (b: DayBucket) => (b.tips[0]?.createdAt ?? b.picks[0]?.createdAt)!;

  return (
    <div className="d-flex flex-column gap-2">
      {buckets.map((b) => {
        const isOpen = openDays.has(b.key);
        const exactCount = b.tips.length;
        const advanceCount = b.tips.filter((t) => t.advanceShort != null).length;
        const top4Count = new Set(b.picks.map((p) => p.userId)).size;

        // Group the top-4 picks by tipster so each tipster shows as one row.
        const picksByUser = new Map<number, PlayoffPickRow[]>();
        for (const p of b.picks) {
          if (!picksByUser.has(p.userId)) picksByUser.set(p.userId, []);
          picksByUser.get(p.userId)!.push(p);
        }

        return (
          <div
            key={b.key}
            style={{ border: '1px solid var(--wc-border)', borderRadius: 6, overflow: 'hidden' }}
          >
            <button
              type="button"
              onClick={() => toggleDay(b.key)}
              className="d-flex align-items-center justify-content-between w-100 gap-2"
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
                  style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                >
                  ▸
                </span>
                <span style={{ fontWeight: 600 }}>{formatDayLabel(sampleIso(b))}</span>
              </span>
              <span
                className="d-flex align-items-center gap-3"
                style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', color: 'var(--wc-text-muted)' }}
              >
                <span title="Exact-score tips placed">🎯 {exactCount}</span>
                <span title="Advancing-team picks placed">⏫ {advanceCount}</span>
                <span title="Top-4 sets placed">🏅 {top4Count}</span>
              </span>
            </button>

            {isOpen && (
              <div>
                {/* Per-match knockout tips */}
                {b.tips.map((t) => (
                  <div
                    key={`t-${t.id}`}
                    className="d-flex align-items-center justify-content-between gap-3"
                    style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--wc-border)' }}
                  >
                    <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                      <TipsterName name={t.tipsterName} shareToken={t.shareToken} tipsPublic={t.tipsPublic} />
                      <span
                        className="d-flex align-items-center gap-1"
                        style={{ color: 'var(--wc-text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                      >
                        <span style={{ opacity: 0.7 }}>{t.roundLabel}:</span>
                        <FlagIcon code={t.homeCc} />
                        <span>{t.homeShort ?? 'TBD'}</span>
                        <span style={{ opacity: 0.6 }}>vs</span>
                        <span>{t.awayShort ?? 'TBD'}</span>
                        <FlagIcon code={t.awayCc} />
                      </span>
                    </div>

                    <div className="d-flex align-items-center gap-3" style={{ whiteSpace: 'nowrap' }}>
                      <span className="d-flex flex-column align-items-end">
                        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.72rem' }}>Tip</span>
                        <span style={{ color: 'var(--wc-text)', fontWeight: 600 }}>
                          {t.tipHome}:{t.tipAway}
                          {t.advanceShort && (
                            <span style={{ color: 'var(--wc-text-muted)', fontWeight: 400 }}>
                              {' '}· {t.advanceShort} ↑
                            </span>
                          )}
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

                {/* Top-4 placement picks — one row per tipster */}
                {Array.from(picksByUser.values()).map((userPicks) => {
                  const first = userPicks[0];
                  const bySlot = new Map(userPicks.map((p) => [p.slot, p]));
                  const scored = userPicks.every((p) => p.points !== null);
                  const total = userPicks.reduce((sum, p) => sum + (p.points ?? 0), 0);
                  return (
                    <div
                      key={`p-${first.userId}`}
                      className="d-flex align-items-center justify-content-between gap-3"
                      style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--wc-border)' }}
                    >
                      <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                        <TipsterName name={first.tipsterName} shareToken={first.shareToken} tipsPublic={first.tipsPublic} />
                        <span
                          className="d-flex align-items-center gap-2 flex-wrap"
                          style={{ color: 'var(--wc-text-muted)', fontSize: '0.82rem' }}
                        >
                          {SLOT_ORDER.filter((s) => bySlot.has(s)).map((s) => {
                            const p = bySlot.get(s)!;
                            return (
                              <span key={s} className="d-flex align-items-center gap-1">
                                <span>{SLOT_BADGE[s]}</span>
                                <FlagIcon code={p.teamCc} />
                                <span>{p.teamShort}</span>
                              </span>
                            );
                          })}
                        </span>
                      </div>

                      <div className="d-flex align-items-center gap-3" style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.72rem' }}>Top-4</span>
                        {scored ? (
                          <span
                            style={{
                              color: pointsColor(total),
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              minWidth: '2.2rem',
                              textAlign: 'right',
                            }}
                          >
                            {pointsLabel(total)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>
                            {formatTime(first.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
