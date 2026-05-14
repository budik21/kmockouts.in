'use client';

import { useEffect, useRef, useState } from 'react';
import { LEAGUE_CODE_LENGTH, normalizeLeagueCode } from '@/lib/league-code';

interface Props {
  onClose: () => void;
  onJoined: () => void;
}

interface JoinResult {
  name: string;
  code: string;
  alreadyMember: boolean;
}

export default function EntryLeagueModal({ onClose, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/leagues/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Wrong code.');
      setResult({ name: data.name, code: data.code, alreadyMember: !!data.alreadyMember });
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="leagues-modal-backdrop" onClick={onClose}>
      <div className="leagues-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {!result ? (
          <>
            <h3 className="leagues-modal-title">Entry to a league</h3>
            <p className="leagues-modal-desc">
              Enter the {LEAGUE_CODE_LENGTH}-character code you received from the league
              owner. The code uses letters and digits only (no zero, no letter O, etc.).
            </p>
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                className="form-control leagues-code-input"
                value={code}
                onChange={(e) => setCode(normalizeLeagueCode(e.target.value).slice(0, LEAGUE_CODE_LENGTH))}
                maxLength={LEAGUE_CODE_LENGTH}
                placeholder="ABC234"
                disabled={submitting}
                autoComplete="off"
                inputMode="text"
                spellCheck={false}
              />
              {error && <div className="alert alert-danger py-2 small mt-3 mb-0">{error}</div>}
              <div className="leagues-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || code.length !== LEAGUE_CODE_LENGTH}
                >
                  {submitting ? 'Joining…' : 'Entry the league'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3 className="leagues-modal-title">
              {result.alreadyMember ? 'Already a member' : 'Joined! 🎉'}
            </h3>
            <p className="leagues-modal-desc">
              {result.alreadyMember
                ? `You are already a member of "${result.name}".`
                : `You joined "${result.name}". Your existing tips count immediately.`}
            </p>
            <div className="leagues-modal-actions">
              <a href={`/pickem/leagues/${result.code}`} className="btn btn-outline-primary">
                View leaderboard
              </a>
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
