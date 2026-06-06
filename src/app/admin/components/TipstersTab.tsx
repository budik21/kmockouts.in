'use client';

import { useMemo, useState } from 'react';
import { useHasMounted } from '@/lib/use-has-mounted';

export interface TipsterRow {
  id: number;
  name: string;
  email: string;
  createdAt: string; // ISO 8601 (UTC)
}

// Local-timezone YYYY-MM-DD, used both as the grouping key and for sorting.
// Tipsters arrive newest-first from the server, so local-day order stays
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

export default function TipstersTab({ tipsters }: { tipsters: TipsterRow[] }) {
  // Dates are formatted in the admin's local timezone, which differs from the
  // server's — gate on mount so the grouped markup is client-only and can't
  // trigger a hydration mismatch.
  const mounted = useHasMounted();
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, TipsterRow[]>();
    for (const t of tipsters) {
      const key = dayKey(t.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [tipsters]);

  if (!mounted) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>Loading…</p>;
  }

  if (tipsters.length === 0) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>No tipsters have signed up yet.</p>;
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
                {rows.length} {rows.length === 1 ? 'tipster' : 'tipsters'}
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
                    <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                      <span style={{ color: 'var(--wc-text)' }}>{t.name || '(no name)'}</span>
                      <span
                        style={{
                          color: 'var(--wc-text-muted)',
                          fontSize: '0.82rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.email}
                      </span>
                    </div>
                    <span
                      style={{
                        color: 'var(--wc-text-muted)',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTime(t.createdAt)}
                    </span>
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
