'use client';

import { useState } from 'react';
import type { FeatureFlag } from '@/lib/feature-flags';

interface Props {
  initialFlags: FeatureFlag[];
  isSuperadmin: boolean;
}

export default function FeatureFlagsClient({ initialFlags, isSuperadmin }: Props) {
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: string, nextEnabled: boolean) => {
    if (!isSuperadmin) return;
    setError(null);
    setPendingKey(key);

    // Optimistic update
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: nextEnabled } : f)));

    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled: nextEnabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(body.error || 'Failed to update flag.');
      }
      const data = (await res.json()) as { flags: FeatureFlag[] };
      setFlags(data.flags);
    } catch (err) {
      // Revert on failure
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !nextEnabled } : f)));
      setError(err instanceof Error ? err.message : 'Failed to update flag.');
    } finally {
      setPendingKey(null);
    }
  };

  if (flags.length === 0) {
    return (
      <p style={{ color: 'var(--wc-text-muted)' }}>No feature flags configured.</p>
    );
  }

  return (
    <div>
      {!isSuperadmin && (
        <div
          className="p-2 rounded mb-3"
          style={{
            backgroundColor: 'rgba(255, 193, 7, 0.08)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            color: 'var(--wc-text-muted)',
            fontSize: '0.9rem',
          }}
        >
          Read-only view. Only the superadmin can change feature flags.
        </div>
      )}

      {error && (
        <div
          className="p-2 rounded mb-3"
          style={{
            backgroundColor: 'rgba(220, 53, 69, 0.12)',
            border: '1px solid rgba(220, 53, 69, 0.3)',
            color: 'var(--wc-text)',
          }}
        >
          {error}
        </div>
      )}

      <ul className="list-group">
        {flags.map((flag) => {
          const isPending = pendingKey === flag.key;
          const disabled = !isSuperadmin || isPending;
          return (
            <li
              key={flag.key}
              className="list-group-item"
              style={{
                backgroundColor: 'var(--wc-surface)',
                color: 'var(--wc-text)',
                border: '1px solid var(--wc-border)',
              }}
            >
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>
                    <code style={{ color: 'var(--wc-accent)' }}>{flag.key}</code>
                  </div>
                  <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem', lineHeight: 1.4 }}>
                    {flag.description}
                  </div>
                  <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                    Last updated: {new Date(flag.updatedAt).toLocaleString()}
                  </div>
                </div>

                <label
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: 52,
                    height: 28,
                    flexShrink: 0,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled && !isSuperadmin ? 0.6 : 1,
                  }}
                  aria-label={`Toggle ${flag.key}`}
                  title={isSuperadmin ? (flag.enabled ? 'Click to disable' : 'Click to enable') : 'Superadmin only'}
                >
                  <input
                    type="checkbox"
                    checked={flag.enabled}
                    disabled={disabled}
                    onChange={(e) => toggle(flag.key, e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 14,
                      backgroundColor: flag.enabled ? 'var(--wc-accent)' : 'rgba(255,255,255,0.15)',
                      transition: 'background-color 0.2s',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: flag.enabled ? 27 : 3,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
