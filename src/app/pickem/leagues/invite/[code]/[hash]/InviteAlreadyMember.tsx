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
      <div className="d-flex gap-2 justify-content-center flex-wrap">
        <Link href={`/pickem/leagues/${code}`} className="tipovacka-btn tipovacka-btn-google">
          View leaderboard
        </Link>
        <Link href="/pickem/tips?tab=leagues" className="btn btn-outline-secondary">
          My leagues
        </Link>
      </div>
    </div>
  );
}
