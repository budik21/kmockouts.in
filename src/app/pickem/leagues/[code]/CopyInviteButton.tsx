'use client';

import { useState } from 'react';

interface Props {
  // Server-minted path like /pickem/leagues/invite/<code>/<hash>.
  // The origin is prepended client-side so the link is absolute when shared.
  invitePath: string;
}

export default function CopyInviteButton({ invitePath }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const inviteUrl = `${window.location.origin}${invitePath}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy invite link:', inviteUrl);
    }
  };

  return (
    <div className="league-invite-bar">
      <button
        type="button"
        className="btn league-invite-copy-btn"
        onClick={copy}
      >
        {copied ? 'Invite link copied!' : 'Copy invite link'}
      </button>
    </div>
  );
}
