'use client';

import { useState } from 'react';
import Spinner from './Spinner';
import { useAdminAction } from './useAdminAction';

/**
 * Admin action to recalculate the standings of a single league. Accepts either
 * a bare league code (e.g. "H8TEVG") or a full league URL
 * (e.g. "https://knockouts.in/pickem/leagues/H8TEVG"); the server extracts the
 * code from the last path segment. Unlike AdminActionWidget this needs a text
 * input, so it wires up useAdminAction directly with requiresConfirm: false.
 */
export default function LeagueRecalcWidget() {
  const [input, setInput] = useState('');

  const { state, trigger } = useAdminAction({
    requiresConfirm: false,
    completedLabel: 'League recalculated',
    run: async () => {
      const value = input.trim();
      if (!value) throw new Error('Enter a league code or URL.');
      const res = await fetch('/api/admin/leagues/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
      }
      return (data as { message?: string }).message ?? 'League recalculated';
    },
  });

  const cardStyle: React.CSSProperties = {
    padding: '1.5rem',
    marginBottom: '1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--wc-border)',
    borderRadius: '0.375rem',
  };

  const titleStyle: React.CSSProperties = {
    color: 'var(--wc-text)',
    fontSize: '1.05rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  };

  const descStyle: React.CSSProperties = {
    color: 'var(--wc-text-muted)',
    fontSize: '0.9rem',
    marginBottom: '1rem',
    lineHeight: 1.5,
  };

  const inputStyle: React.CSSProperties = {
    flex: '1 1 auto',
    minWidth: '14rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--wc-surface)',
    color: 'var(--wc-text)',
    border: '1px solid var(--wc-border)',
    borderRadius: '0.25rem',
    fontSize: '0.95rem',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.25rem',
    cursor: 'pointer',
    backgroundColor: 'var(--wc-accent)',
    color: '#2a1a00',
    border: 'none',
    whiteSpace: 'nowrap',
  };

  const running = state.kind === 'running';

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Recalculate a single league</div>
      <div style={descStyle}>
        Rebuild the standings of one tipping league and refresh its leaderboard cache. Paste the
        league URL or just its code (e.g. <code>H8TEVG</code>). Use this if a league shows stale tip
        counts.
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !running && input.trim()) trigger();
          }}
          placeholder="https://knockouts.in/pickem/leagues/H8TEVG  or  H8TEVG"
          disabled={running}
          style={inputStyle}
        />
        <button onClick={trigger} disabled={running || !input.trim()} style={buttonStyle}>
          Recalculate league
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minHeight: '1.75rem', marginTop: '0.75rem' }}>
        {running && (
          <>
            <Spinner size="sm" />
            <span style={{ color: 'var(--wc-text)', fontSize: '0.95rem' }}>Recalculating league…</span>
          </>
        )}
        {state.kind === 'done' && (
          <span style={{ color: '#4caf50', fontSize: '0.95rem', fontWeight: 500 }}>
            ✓ {state.message}
          </span>
        )}
        {state.kind === 'error' && (
          <span style={{ color: '#f44336', fontSize: '0.95rem', fontWeight: 500 }}>
            ✗ {state.message}
          </span>
        )}
      </div>
    </div>
  );
}
