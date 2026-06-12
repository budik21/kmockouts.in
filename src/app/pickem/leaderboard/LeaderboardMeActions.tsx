'use client';

import Link from 'next/link';

interface Props {
  shareToken: string;
}

export default function LeaderboardMeActions({ shareToken }: Props) {
  const handleShowPosition = () => {
    window.dispatchEvent(new CustomEvent('leaderboard-show-me'));
  };

  return (
    <div className="leaderboard-me-actions">
      <button type="button" className="leaderboard-action-btn" onClick={handleShowPosition}>
        Show my position
      </button>
      <Link href={`/pickem/share/${shareToken}`} className="leaderboard-action-btn">
        My predictions →
      </Link>
    </div>
  );
}
