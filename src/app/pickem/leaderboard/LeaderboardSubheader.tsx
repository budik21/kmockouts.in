'use client';

import TeamFlag from '@/app/components/TeamFlag';
import LocalKickOff from '@/app/components/LocalKickOff';
import LeaderboardMeWidget from './LeaderboardMeWidget';
import LeaderboardMeActions from './LeaderboardMeActions';
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
  currentUserEntry?: { rank: number; totalPoints: number; shareToken: string; totalRanked: number } | null;
}

export default function LeaderboardSubheader({ description, lastScored, currentUserEntry }: Props) {
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
      {currentUserEntry && (
        <div className="leaderboard-subheader-right">
          <LeaderboardMeWidget
            rank={currentUserEntry.rank}
            totalRanked={currentUserEntry.totalRanked}
            totalPoints={currentUserEntry.totalPoints}
          />
          <LeaderboardMeActions shareToken={currentUserEntry.shareToken} />
        </div>
      )}
    </div>
  );
}
