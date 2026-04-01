'use client';

import { useState } from 'react';
import TeamFlag from '@/app/components/TeamFlag';
import { slugify } from '@/lib/slugify';

interface RankingTeam {
  id: number;
  name: string;
  shortName: string;
  countryCode: string;
  groupId: string;
  fifaRanking: number | null;
}

interface Props {
  teams: RankingTeam[];
  groups: string[];
  rankingDate: string | null;
}

export default function FifaRankingClient({ teams, groups, rankingDate }: Props) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const filtered = activeGroup ? teams.filter((t) => t.groupId === activeGroup) : teams;
  const showGaps = !activeGroup; // gaps only make sense for full ranking view

  return (
    <main className="container py-4">
      <h1 className="ranking-page-title">FIFA World Ranking</h1>
      <p className="ranking-page-subtitle">
        World Cup 2026 participants ranked by FIFA Men&apos;s World Ranking
        {rankingDate && <span className="ranking-date"> &middot; {rankingDate}</span>}
      </p>

      {/* Group filter pills */}
      <div className="ranking-filters">
        <button
          className={`ranking-filter-pill ${activeGroup === null ? 'active' : ''}`}
          onClick={() => setActiveGroup(null)}
        >
          All
        </button>
        {groups.map((g) => (
          <button
            key={g}
            className={`ranking-filter-pill ${activeGroup === g ? 'active' : ''}`}
            onClick={() => setActiveGroup(activeGroup === g ? null : g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="ranking-table-wrapper">
        <table className="ranking-table">
          <thead>
            <tr>
              <th className="ranking-col-rank">#</th>
              <th className="ranking-col-team">Team</th>
              <th className="ranking-col-group">Group</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((team, i) => {
              let showGap = false;
              let gapSize = 0;

              if (showGaps) {
                const prevRank = i > 0 ? filtered[i - 1].fifaRanking : null;
                const currRank = team.fifaRanking;
                showGap = currRank != null && prevRank != null && currRank - prevRank > 1;
                gapSize = showGap ? currRank! - prevRank! - 1 : 0;
              }

              return (
                <GapAndRow key={team.id} team={team} showGap={showGap} gapSize={gapSize} />
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function GapAndRow({
  team,
  showGap,
  gapSize,
}: {
  team: RankingTeam;
  showGap: boolean;
  gapSize: number;
}) {
  return (
    <>
      {showGap && (
        <tr className="ranking-gap-row">
          <td className="ranking-col-rank">
            <span className="ranking-gap-dots">&#8942;</span>
          </td>
          <td className="ranking-col-team ranking-gap-cell">
            <span className="ranking-gap-label">
              {gapSize} {gapSize === 1 ? 'team' : 'teams'} not at WC
            </span>
          </td>
          <td className="ranking-col-group" />
        </tr>
      )}
      <tr className="ranking-team-row">
        <td className="ranking-col-rank">
          <span className="ranking-rank-badge">{team.fifaRanking ?? '—'}</span>
        </td>
        <td className="ranking-col-team">
          <div className="ranking-team-inner">
            <TeamFlag countryCode={team.countryCode} size="md" />
            <a href={`/worldcup2026/group-${team.groupId.toLowerCase()}/team/${slugify(team.name)}`} className="ranking-team-name">
              {team.name}
            </a>
            <span className="ranking-team-code">{team.shortName}</span>
          </div>
        </td>
        <td className="ranking-col-group">
          <a href={`/worldcup2026/group-${team.groupId.toLowerCase()}`} className="ranking-group-link">
            {team.groupId}
          </a>
        </td>
      </tr>
    </>
  );
}
