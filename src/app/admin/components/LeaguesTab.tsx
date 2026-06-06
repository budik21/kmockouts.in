'use client';

import { useMemo, useState } from 'react';
import { useHasMounted } from '@/lib/use-has-mounted';

export interface LeagueRow {
  id: number;
  code: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  createdAt: string; // ISO 8601 (UTC)
}

// Local-timezone YYYY-MM-DD, used both as the grouping key and for sorting.
// Leagues arrive newest-first from the server, so local-day order stays
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

export default function LeaguesTab({ leagues }: { leagues: LeagueRow[] }) {
  // Dates are formatted in the admin's local timezone, which differs from the
  // server's — gate on mount so the grouped markup is client-only and can't
  // trigger a hydration mismatch.
  const mounted = useHasMounted();
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, LeagueRow[]>();
    for (const l of leagues) {
      const key = dayKey(l.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries());
  }, [leagues]);

  if (!mounted) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>Loading…</p>;
  }

  if (leagues.length === 0) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>No leagues have been created yet.</p>;
  }

  const toggleDay = (key: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
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
                {rows.length} {rows.length === 1 ? 'league' : 'leagues'}
              </span>
            </button>

            {isOpen && (
              <div>
                {rows.map((l) => (
                  <div
                    key={l.id}
                    className="d-flex align-items-center justify-content-between gap-3"
                    style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--wc-border)' }}
                  >
                    <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                      <span className="d-flex align-items-center gap-2" style={{ color: 'var(--wc-text)' }}>
                        <span>{l.name}</span>
                        <span
                          style={{
                            color: 'var(--wc-text-muted)',
                            fontSize: '0.75rem',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          }}
                        >
                          {l.code}
                        </span>
                      </span>
                      <span
                        style={{
                          color: 'var(--wc-text-muted)',
                          fontSize: '0.82rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        by {l.ownerName || '(no name)'} · {l.ownerEmail}
                      </span>
                    </div>
                    <div className="d-flex align-items-center gap-3" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>
                        {l.memberCount} {l.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>
                        {formatTime(l.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
