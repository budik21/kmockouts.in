'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

export default function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/me', { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to delete account');
      }
      await signOut({ callbackUrl: '/' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete account');
      setLoading(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => setConfirming(true)}
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="me-danger-confirm">
      <p className="me-danger-confirm-text">
        Are you sure? This will permanently delete your account and all your tips.
      </p>
      <div className="d-flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? 'Deleting…' : 'Yes, delete my account'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}
