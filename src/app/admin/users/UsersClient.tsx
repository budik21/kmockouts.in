'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  initialEmails: string[];
  superadmin: string;
}

export default function UsersClient({ initialEmails, superadmin }: Props) {
  const [emails, setEmails] = useState<string[]>(initialEmails);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      setError(body.error || 'Failed to add admin.');
      return;
    }
    setEmails((prev) => (prev.includes(email) ? prev : [...prev, email].sort()));
    setNewEmail('');
    refresh();
  };

  const removeAdmin = async (email: string) => {
    if (email === superadmin) return;
    if (!confirm(`Remove admin access for ${email}?`)) return;
    setError(null);
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      setError(body.error || 'Failed to remove admin.');
      return;
    }
    setEmails((prev) => prev.filter((e) => e !== email));
    refresh();
  };

  return (
    <div>
      <form onSubmit={addAdmin} className="d-flex gap-2 mb-3">
        <input
          type="email"
          className="form-control"
          placeholder="new.admin@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          style={{ maxWidth: 360 }}
        />
        <button
          type="submit"
          className="btn"
          style={{ backgroundColor: 'var(--wc-accent)', color: '#fff' }}
          disabled={pending}
        >
          Add admin
        </button>
      </form>

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
        {emails.map((email) => {
          const isSuperadmin = email === superadmin;
          return (
            <li
              key={email}
              className="list-group-item d-flex align-items-center justify-content-between"
              style={{
                backgroundColor: 'var(--wc-surface)',
                color: 'var(--wc-text)',
                border: '1px solid var(--wc-border)',
              }}
            >
              <span>
                {email}
                {isSuperadmin && (
                  <span
                    className="ms-2 badge"
                    style={{ backgroundColor: 'var(--wc-accent)', color: '#fff' }}
                  >
                    superadmin
                  </span>
                )}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => removeAdmin(email)}
                disabled={isSuperadmin || pending}
                title={isSuperadmin ? 'Superadmin cannot be removed' : 'Remove admin'}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
