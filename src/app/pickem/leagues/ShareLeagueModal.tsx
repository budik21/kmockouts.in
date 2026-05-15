'use client';

import { useEffect, useState } from 'react';

interface Props {
  code: string;
  name: string;
  inviteUrl: string;
  onClose: () => void;
}

export default function ShareLeagueModal({ code, name, inviteUrl, onClose }: Props) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      window.prompt('Copy invite link:', inviteUrl);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      window.prompt('Copy code:', code);
    }
  };

  return (
    <div className="leagues-modal-backdrop" onClick={onClose}>
      <div
        className="leagues-modal leagues-share-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <h3 className="leagues-modal-title" id="share-modal-title">
          Share &ldquo;{name}&rdquo;
        </h3>

        <div className="leagues-share-intro">
          <p className="mb-2">
            There are two ways to bring someone into this league:
          </p>
          <ol className="leagues-share-howto">
            <li>
              <strong>Share the code.</strong> Tell a friend the 6-character code below.
              They sign in at <span className="leagues-share-host">knockouts.in/pickem/tips</span>,
              open the <em>Leagues</em> tab and click <em>Entry to League</em>.
            </li>
            <li>
              <strong>Or share the invite link.</strong> Send the link below — one click,
              sign in, confirm, done.
            </li>
          </ol>
        </div>

        <div className="leagues-share-section">
          <div className="leagues-share-label">League code</div>
          <button
            type="button"
            className="leagues-share-code"
            onClick={copyCode}
            title="Click to copy code"
            aria-label={`Copy league code ${code}`}
          >
            {code}
          </button>
          <div className="leagues-share-hint">
            {copiedCode ? 'Code copied!' : 'Tap the code to copy it.'}
          </div>
        </div>

        <div className="leagues-share-section">
          <div className="leagues-share-label">Invite link</div>
          <div className="leagues-share-link-row">
            <input
              type="text"
              className="form-control leagues-share-link-input"
              value={inviteUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
              aria-label="Invite link"
            />
          </div>
          <button
            type="button"
            className="btn leagues-share-copy-btn"
            onClick={copyLink}
          >
            {copiedLink ? 'Link copied!' : 'Copy Link'}
          </button>
        </div>

        <div className="leagues-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
