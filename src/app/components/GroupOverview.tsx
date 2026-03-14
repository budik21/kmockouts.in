'use client';

import Link from 'next/link';
import GroupStandings, { TeamProbData } from './GroupStandings';

interface GroupData {
  groupId: string;
  standings: {
    position: number;
    team: { id: number; name: string; shortName: string; countryCode: string; isPlaceholder: boolean };
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  }[];
  probabilities?: Record<number, TeamProbData>;
}

interface GroupOverviewProps {
  groups: Record<string, GroupData>;
}

export default function GroupOverview({ groups }: GroupOverviewProps) {
  const groupIds = Object.keys(groups).sort();

  return (
    <div className="row g-3">
      {groupIds.map((gid) => {
        const group = groups[gid];
        return (
          <div key={gid} className="col-12 col-md-6 col-lg-4">
            <Link href={`/group/${gid}`} style={{ textDecoration: 'none' }}>
              <div className="group-card">
                <div className="group-card-header">
                  <span>Group {gid}</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                    {group.standings[0]?.matchesPlayed ?? 0}/3 played
                  </span>
                </div>
                <div className="group-card-body">
                  <GroupStandings
                    standings={group.standings}
                    compact
                    probabilities={group.probabilities}
                  />
                </div>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
