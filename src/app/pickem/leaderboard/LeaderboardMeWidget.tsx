'use client';

interface Props {
  rank: number;
  totalRanked: number;
  totalPoints: number;
}

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardMeWidget({ rank, totalRanked, totalPoints }: Props) {
  return (
    <div className="leaderboard-me-widget">
      <div className="leaderboard-me-widget-top">
        {medal(rank) && <span className="leaderboard-me-widget-medal">{medal(rank)}</span>}
        <span className="leaderboard-me-widget-label">You&rsquo;re ranked</span>
        <span className="leaderboard-me-widget-rank">#{rank}</span>
        <span className="leaderboard-me-widget-outof">out of {totalRanked}</span>
      </div>
      <div className="leaderboard-me-widget-pts">{totalPoints} pts</div>
    </div>
  );
}
