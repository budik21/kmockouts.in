'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TeamFlag from '@/app/components/TeamFlag';

export interface LastScoredMatch {
  homeName: string;
  homeShort: string;
  homeCode: string;
  awayName: string;
  awayShort: string;
  awayCode: string;
  homeGoals: number;
  awayGoals: number;
  kickOff: string;
}

interface Props {
  description: string;
  lastScored: LastScoredMatch | null;
}

function formatKickOff(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short',
    });
  } catch { return ''; }
}

export default function LeaderboardSubheader({ description, lastScored }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 1500);
    });
  };

  return (
    <div className="leaderboard-subheader mb-4">
      <div className="leaderboard-subheader-info">
        <p className="leaderboard-subheader-desc">{description}</p>
        {lastScored && (
          <div className="leaderboard-last-scored">
            <span className="leaderboard-last-scored-label">Last scored match:</span>
            <span className="leaderboard-last-scored-match">
              <TeamFlag countryCode={lastScored.homeCode} />
              <span className="leaderboard-last-scored-team-full">{lastScored.homeName}</span>
              <span className="leaderboard-last-scored-team-short">{lastScored.homeShort}</span>
              <span className="leaderboard-last-scored-score">
                {lastScored.homeGoals} : {lastScored.awayGoals}
              </span>
              <span className="leaderboard-last-scored-team-full">{lastScored.awayName}</span>
              <span className="leaderboard-last-scored-team-short">{lastScored.awayShort}</span>
              <TeamFlag countryCode={lastScored.awayCode} />
              <span className="leaderboard-last-scored-date">· {formatKickOff(lastScored.kickOff)}</span>
            </span>
          </div>
        )}
      </div>
      <button
        className="leaderboard-refresh-btn"
        onClick={handleRefresh}
        disabled={pending}
        aria-label="Refresh leaderboard"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={pending ? 'spinning' : ''}
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <span>{justRefreshed ? 'Refreshed' : pending ? 'Refreshing…' : 'Refresh leaderboard'}</span>
      </button>
    </div>
  );
}
