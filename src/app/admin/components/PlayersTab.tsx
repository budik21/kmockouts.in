'use client';

import { useMemo, useState } from 'react';

export interface PlayerRow {
  id: number;
  name: string;
  email: string;
  tipsPublic: boolean;
  notifyExactScore: boolean;
  notifyWinnerOnly: boolean;
  notifyWrongTip: boolean;
  notifyPlayoff: boolean;
  groupTips: number;
  playoffTips: number;
}

type SortKey = 'name' | 'email' | 'groupTips' | 'playoffTips';
type SortDir = 'asc' | 'desc';

// The four per-tip e-mail toggles, mirroring the public Settings → Notifications
// screen. Rendered as a compact row of indicators per user.
const NOTIFY_COLS = [
  { key: 'notifyExactScore', icon: '🎯', label: 'Exact score' },
  { key: 'notifyWinnerOnly', icon: '✅', label: 'Correct winner' },
  { key: 'notifyWrongTip', icon: '😢', label: 'Wrong tip' },
  { key: 'notifyPlayoff', icon: '🏆', label: 'Play-off results' },
] as const;

export default function PlayersTab({ players }: { players: PlayerRow[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? players.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
        )
      : players;

    const sorted = [...rows].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name' || sortKey === 'email') {
        cmp = (a[sortKey] || '').localeCompare(b[sortKey] || '', undefined, {
          sensitivity: 'base',
        });
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [players, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Names/emails read best ascending; counts most-interesting descending.
      setSortDir(key === 'name' || key === 'email' ? 'asc' : 'desc');
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const headerCellStyle: React.CSSProperties = {
    color: 'var(--wc-text-muted)',
    fontSize: '0.78rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--wc-border)',
    whiteSpace: 'nowrap',
  };

  const sortableHeaderStyle: React.CSSProperties = {
    ...headerCellStyle,
    cursor: 'pointer',
    userSelect: 'none',
  };

  const cellStyle: React.CSSProperties = {
    color: 'var(--wc-text)',
    fontSize: '0.9rem',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--wc-border)',
    verticalAlign: 'middle',
  };

  if (players.length === 0) {
    return <p style={{ color: 'var(--wc-text-muted)' }}>No users have signed up yet.</p>;
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or e-mail…"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--wc-border)',
            borderRadius: 6,
            color: 'var(--wc-text)',
            padding: '0.45rem 0.75rem',
            fontSize: '0.9rem',
            minWidth: 260,
            maxWidth: '100%',
          }}
        />
        <span style={{ color: 'var(--wc-text)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
          {search ? (
            <>
              Showing{' '}
              <strong style={{ color: 'var(--wc-accent)' }}>{filtered.length}</strong> of{' '}
              {players.length}
            </>
          ) : (
            <>
              Total:{' '}
              <strong style={{ color: 'var(--wc-accent)' }}>{players.length}</strong>{' '}
              {players.length === 1 ? 'user' : 'users'}
            </>
          )}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={sortableHeaderStyle} onClick={() => toggleSort('name')}>
                Name{sortIndicator('name')}
              </th>
              <th style={sortableHeaderStyle} onClick={() => toggleSort('email')}>
                E-mail{sortIndicator('email')}
              </th>
              <th style={{ ...headerCellStyle, textAlign: 'center' }}>
                E-mail replies
              </th>
              <th
                style={{ ...sortableHeaderStyle, textAlign: 'right' }}
                onClick={() => toggleSort('groupTips')}
              >
                Group tips{sortIndicator('groupTips')}
              </th>
              <th
                style={{ ...sortableHeaderStyle, textAlign: 'right' }}
                onClick={() => toggleSort('playoffTips')}
              >
                Play-off tips{sortIndicator('playoffTips')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td style={cellStyle}>{p.name || '(no name)'}</td>
                <td style={{ ...cellStyle, color: 'var(--wc-text-muted)' }}>{p.email}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <span className="d-inline-flex gap-2" style={{ justifyContent: 'center' }}>
                    {NOTIFY_COLS.map((c) => {
                      const on = p[c.key];
                      return (
                        <span
                          key={c.key}
                          title={`${c.label}: ${on ? 'on' : 'off'}`}
                          style={{
                            fontSize: '1rem',
                            opacity: on ? 1 : 0.2,
                            filter: on ? 'none' : 'grayscale(1)',
                          }}
                        >
                          {c.icon}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {p.groupTips}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {p.playoffTips}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
        E-mail replies: {NOTIFY_COLS.map((c) => `${c.icon} ${c.label}`).join(' · ')} — lit when the
        user opted in to that post-scoring e-mail.
      </p>
    </div>
  );
}
