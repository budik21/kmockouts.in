'use client';

import Link from 'next/link';
import GroupStandings, { TeamProbData } from './GroupStandings';
import AdBanner from './AdBanner';

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
  /** AdSense slot ID for the mid-groups banner (between row 2 and 3) */
  adSlot?: string;
}

export default function GroupOverview({ groups, adSlot }: GroupOverviewProps) {
  const groupIds = Object.keys(groups).sort();

  // Split into first 6 groups (rows 1-2) and remaining (rows 3-4)
  const firstHalf = groupIds.slice(0, 6);
  const secondHalf = groupIds.slice(6);

  const renderGroupCard = (gid: string) => {
    const group = groups[gid];
    return (
      <div key={gid} className="col-12 col-md-6 col-lg-4">
        <Link href={`/worldcup2026/group-${gid.toLowerCase()}`} style={{ textDecoration: 'none' }}>
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
  };

  return (
    <>
      <div className="row g-3">
        {firstHalf.map(renderGroupCard)}
      </div>

      {adSlot && (
        <AdBanner slot={adSlot} format="auto" className="my-3" />
      )}

      <div className="row g-3 mt-0">
        {secondHalf.map(renderGroupCard)}
      </div>
    </>
  );
}
