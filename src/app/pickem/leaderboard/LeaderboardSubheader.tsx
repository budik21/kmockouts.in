'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TeamFlag from '@/app/components/TeamFlag';
import LocalKickOff from '@/app/components/LocalKickOff';
import LeaderboardMeWidget from './LeaderboardMeWidget';
import { teamLabel } from '@/lib/team-label';

export interface LastScoredMatch {
  homeName: string;
  homeShort: string;
  homeCode: string;
  homeFifa: number | null;
  awayName: string;
  awayShort: string;
  awayCode: string;
  awayFifa: number | null;
  homeGoals: number;
  awayGoals: number;
  kickOff: string;
}

interface Props {
  description: string;
  lastScored: LastScoredMatch | null;
  currentUserEntry?: { rank: number; totalPoints: number; shareToken: string } | null;
}

export default function LeaderboardSubheader({ description, lastScored, currentUserEntry }: Props) {
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
              <span className="leaderboard-last-scored-team-full">{teamLabel(lastScored.homeName, lastScored.homeFifa)}</span>
              <span className="leaderboard-last-scored-team-short">{teamLabel(lastScored.homeShort, lastScored.homeFifa)}</span>
              <span className="leaderboard-last-scored-score">
                {lastScored.homeGoals} : {lastScored.awayGoals}
              </span>
              <span className="leaderboard-last-scored-team-full">{teamLabel(lastScored.awayName, lastScored.awayFifa)}</span>
              <span className="leaderboard-last-scored-team-short">{teamLabel(lastScored.awayShort, lastScored.awayFifa)}</span>
              <TeamFlag countryCode={lastScored.awayCode} />
              <span className="leaderboard-last-scored-date">· <LocalKickOff iso={lastScored.kickOff} dateOptions={{ day: 'numeric', month: 'short' }} /></span>
            </span>
          </div>
        )}
      </div>
      <div className="leaderboard-subheader-right">
        {currentUserEntry && (
          <LeaderboardMeWidget
            rank={currentUserEntry.rank}
            totalPoints={currentUserEntry.totalPoints}
            shareToken={currentUserEntry.shareToken}
          />
        )}
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
    </div>
  );
}
