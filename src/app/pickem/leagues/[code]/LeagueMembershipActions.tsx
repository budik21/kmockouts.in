'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

interface Props {
  code: string;
  leagueName: string;
  signedIn: boolean;
  isMember: boolean;
  isOwner: boolean;
}

export default function LeagueMembershipActions({
  code,
  leagueName,
  signedIn,
  isMember,
  isOwner,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/leagues/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to join league.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave league "${leagueName}"?`)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${encodeURIComponent(code)}/leave`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to leave league.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="league-actions">
      {!signedIn && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => signIn('google', { callbackUrl: `/pickem/leagues/${code}` })}
        >
          Sign in to join
        </button>
      )}
      {signedIn && !isMember && (
        <button type="button" className="btn btn-primary" onClick={handleJoin} disabled={pending}>
          {pending ? 'Joining…' : 'Join this league'}
        </button>
      )}
      {signedIn && isMember && (
        <>
          {isOwner && (
            <span className="badge text-bg-secondary align-self-center">You own this league</span>
          )}
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={handleLeave}
            disabled={pending}
          >
            {pending ? 'Leaving…' : 'Leave league'}
          </button>
        </>
      )}
      {error && <div className="alert alert-danger py-1 px-2 small mb-0">{error}</div>}
    </div>
  );
}
