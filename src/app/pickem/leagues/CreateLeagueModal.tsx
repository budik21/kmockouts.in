'use client';

import { useEffect, useRef, useState } from 'react';
import { LEAGUE_NAME_MAX, LEAGUE_NAME_MIN } from '@/lib/league-validation';

interface CreatedInfo {
  code: string;
  name: string;
  inviteUrl: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateLeagueModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to create league.');
      const fullInvite = `${window.location.origin}${data.inviteUrl}`;
      setCreated({ code: data.code, name: data.name, inviteUrl: fullInvite });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvite = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy invite link:', created.inviteUrl);
    }
  };

  return (
    <div className="leagues-modal-backdrop" onClick={onClose}>
      <div className="leagues-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {!created ? (
          <>
            <h3 className="leagues-modal-title">Create a new league</h3>
            <p className="leagues-modal-desc">
              Give your league a name. After creation, you&apos;ll get a 6-character code
              and an invite link to share with friends.
            </p>
            <form onSubmit={handleSubmit}>
              <label className="form-label small" htmlFor="league-name">League name</label>
              <input
                ref={inputRef}
                id="league-name"
                type="text"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={LEAGUE_NAME_MAX}
                placeholder="e.g. Friends 2026"
                disabled={submitting}
                autoComplete="off"
              />
              <div className="form-text">
                {LEAGUE_NAME_MIN}–{LEAGUE_NAME_MAX} characters. Letters, digits, spaces,
                hyphens and underscores only.
              </div>
              {error && <div className="alert alert-danger py-2 small mt-2 mb-0">{error}</div>}
              <div className="leagues-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || name.trim().length < LEAGUE_NAME_MIN}>
                  {submitting ? 'Creating…' : 'Create league'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3 className="leagues-modal-title">League created 🎉</h3>
            <p className="leagues-modal-desc">
              Your league <strong>{created.name}</strong> is ready. Share the invite link
              with anyone you want to play with.
            </p>
            <div className="leagues-created-code">
              <div className="leagues-created-label">League code</div>
              <div className="leagues-created-code-value">{created.code}</div>
            </div>
            <div>
              <label className="form-label small">Invite link</label>
              <div className="d-flex gap-2">
                <input
                  type="text"
                  className="form-control"
                  value={created.inviteUrl}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button type="button" className="btn btn-primary" onClick={copyInvite}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="form-text">
                Send this link to people you want to invite. They&apos;ll be asked to confirm
                joining after signing in.
              </div>
            </div>
            <div className="leagues-modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
