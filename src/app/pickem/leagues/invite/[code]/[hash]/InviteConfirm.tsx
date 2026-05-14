'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  code: string;
  hash: string;
  leagueName: string;
  ownerName: string;
}

export default function InviteConfirm({ code, hash, leagueName, ownerName }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to join league.');
      router.push(`/pickem/leagues/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending(false);
    }
  };

  return (
    <div className="invite-card">
      <div className="invite-icon">&#127942;</div>
      <h1 className="invite-title">Join &ldquo;{leagueName}&rdquo;?</h1>
      <p className="invite-desc">
        <strong>{ownerName}</strong> invited you to the
        &ldquo;<strong>{leagueName}</strong>&rdquo; tipping league for the FIFA World Cup 2026.
        Your existing tips count automatically — you&apos;ll appear in the leaderboard
        right away.
      </p>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      <div className="d-flex gap-2 justify-content-center flex-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.push('/pickem')}
          disabled={pending}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={pending}
        >
          {pending ? 'Joining…' : 'Entry'}
        </button>
      </div>
    </div>
  );
}
