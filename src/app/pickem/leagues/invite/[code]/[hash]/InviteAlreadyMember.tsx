'use client';

import Link from 'next/link';

interface Props {
  code: string;
  leagueName: string;
}

export default function InviteAlreadyMember({ code, leagueName }: Props) {
  return (
    <div className="invite-card">
      <div className="invite-icon">&#9989;</div>
      <h1 className="invite-title">You&apos;re already in this league</h1>
      <p className="invite-desc">
        You&apos;re already a member of &ldquo;<strong>{leagueName}</strong>&rdquo;.
        No need to join again.
      </p>
      <div className="invite-actions">
        <Link href="/pickem/tips?tab=leagues" className="invite-action-secondary">
          My leagues
        </Link>
        <Link href={`/pickem/leagues/${code}`} className="invite-action-cta">
          View leaderboard
        </Link>
      </div>
    </div>
  );
}
