'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface SimResult {
  usersInserted: number;
  tipsInserted: number;
  withConsent: number;
  withoutConsent: number;
}

export default function SimulateClient() {
  const [busy, setBusy] = useState<'sim' | 'clear' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const refresh = () => startTransition(() => router.refresh());

  const simulate = async () => {
    if (
      !confirm(
        'This will DELETE all existing pick\u2019em data (tipsters + tips) and insert 55 fake tipsters. Continue?',
      )
    ) {
      return;
    }
    setBusy('sim');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/pickem/simulate', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Simulation failed.');
      } else {
        const r = body as SimResult;
        setMessage(
          `Inserted ${r.usersInserted} tipsters (${r.withConsent} with consent, ${r.withoutConsent} without) and ${r.tipsInserted} tips.`,
        );
        refresh();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (!confirm('This will DELETE all pick\u2019em data. Continue?')) return;
    setBusy('clear');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/pickem/clear', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Clear failed.');
      } else {
        setMessage('All pick\u2019em data cleared.');
        refresh();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="d-flex gap-2 flex-wrap mb-3">
        <button
          type="button"
          className="btn"
          style={{ backgroundColor: 'var(--wc-accent)', color: '#2a1a00', fontWeight: 600 }}
          onClick={simulate}
          disabled={busy !== null}
        >
          {busy === 'sim' ? 'Filling…' : 'Fill with 55 fake tipsters'}
        </button>
        <button
          type="button"
          className="btn btn-outline-danger"
          onClick={clear}
          disabled={busy !== null}
        >
          {busy === 'clear' ? 'Clearing…' : 'Clear all pick\u2019em data'}
        </button>
      </div>

      {message && (
        <div
          className="p-2 rounded mb-3"
          style={{
            backgroundColor: 'rgba(25, 135, 84, 0.12)',
            border: '1px solid rgba(25, 135, 84, 0.3)',
            color: 'var(--wc-text)',
          }}
        >
          {message}
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
    </div>
  );
}
