'use client';

import Link from 'next/link';

interface Props {
  rank: number;
  totalPoints: number;
  shareToken: string;
}

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardMeWidget({ rank, totalPoints, shareToken }: Props) {
  const handleShowPosition = () => {
    window.dispatchEvent(new CustomEvent('leaderboard-show-me'));
  };

  return (
    <div className="leaderboard-me-widget">
      <div className="leaderboard-me-widget-top">
        {medal(rank) && <span className="leaderboard-me-widget-medal">{medal(rank)}</span>}
        <span className="leaderboard-me-widget-label">You&rsquo;re ranked</span>
        <span className="leaderboard-me-widget-rank">#{rank}</span>
      </div>
      <div className="leaderboard-me-widget-pts">{totalPoints} pts</div>
      <div className="leaderboard-me-widget-actions">
        <button className="leaderboard-me-widget-btn" onClick={handleShowPosition}>
          Show my position
        </button>
        <Link href={`/pickem/share/${shareToken}`} className="leaderboard-me-widget-link">
          My predictions →
        </Link>
      </div>
    </div>
  );
}
