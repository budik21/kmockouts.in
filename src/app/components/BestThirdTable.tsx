'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { slugify } from '@/lib/slugify';
import TeamFlag from './TeamFlag';

interface ThirdPlacedTeam {
  rank: number;
  groupId: string;
  team: {
    id: number;
    name: string;
    shortName: string;
    countryCode: string;
    isPlaceholder: boolean;
    fifaRanking?: number;
  };
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  fairPlayPoints: number;
}

interface TeamSummary {
  teamId: number;
  summaryHtml: string;
  qualProbability: number;
}

interface BestThirdTableProps {
  teams: ThirdPlacedTeam[];
  /** AI-generated summaries keyed by team ID */
  summaries?: TeamSummary[];
}

export default function BestThirdTable({ teams, summaries }: BestThirdTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const summaryMap = new Map(summaries?.map(s => [s.teamId, s]) ?? []);
  const hasSummaries = summaryMap.size > 0;

  return (
    <div className="table-responsive">
      <table className="standings-table table table-sm mb-0 b3-table-pts-highlight">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th className="text-center d-none d-sm-table-cell">Grp</th>
            <th className="text-center">MP</th>
            <th className="text-center d-none d-sm-table-cell">W</th>
            <th className="text-center d-none d-sm-table-cell">D</th>
            <th className="text-center d-none d-sm-table-cell">L</th>
            <th className="text-center d-none d-sm-table-cell">GF</th>
            <th className="text-center d-none d-sm-table-cell">GA</th>
            <th className="text-center">GD</th>
            <th className="text-center b3-pts-col">Pts</th>
            <th className="text-center d-none d-sm-table-cell">FP</th>
            {hasSummaries && <th className="b3-expand-col"></th>}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const summary = summaryMap.get(t.team.id);
            const isExpanded = expandedId === t.team.id;
            const isClickable = !!summary;
            const colSpan = 11 + (hasSummaries ? 1 : 0);

            return (
              <Fragment key={t.team.id}>
                <tr
                  className={`${t.rank <= 8 ? 'best-third-qualify' : 'best-third-eliminated'}${isClickable ? ' b3-row-clickable' : ''}`}
                  onClick={isClickable ? () => setExpandedId(isExpanded ? null : t.team.id) : undefined}
                >
                  <td>{t.rank}</td>
                  <td className="team-name">
                    <Link href={`/worldcup2026/group-${t.groupId.toLowerCase()}/team/${slugify(t.team.name)}`} className="best-third-team-link" onClick={(e) => e.stopPropagation()}>
                      <TeamFlag countryCode={t.team.countryCode} />
                      <span className="team-name-full">{t.team.name}</span>
                      <span className="team-short" title={t.team.name}>{t.team.shortName}</span>
                    </Link>
                    {t.team.fifaRanking && (
                      <span className="standings-ranking" title="FIFA Ranking">({t.team.fifaRanking})</span>
                    )}
                  </td>
                  <td className="text-center d-none d-sm-table-cell">
                    <Link href={`/worldcup2026/group-${t.groupId.toLowerCase()}`} className="group-link" onClick={(e) => e.stopPropagation()}>
                      {t.groupId}
                    </Link>
                  </td>
                  <td className="text-center">{t.matchesPlayed}</td>
                  <td className="text-center d-none d-sm-table-cell">{t.wins}</td>
                  <td className="text-center d-none d-sm-table-cell">{t.draws}</td>
                  <td className="text-center d-none d-sm-table-cell">{t.losses}</td>
                  <td className="text-center d-none d-sm-table-cell">{t.goalsFor}</td>
                  <td className="text-center d-none d-sm-table-cell">{t.goalsAgainst}</td>
                  <td className="text-center">
                    {t.goalDifference > 0 ? `+${t.goalDifference}` : t.goalDifference}
                  </td>
                  <td className="text-center fw-bold b3-pts-col">{t.points}</td>
                  <td className="text-center d-none d-sm-table-cell">{t.fairPlayPoints}</td>
                  {hasSummaries && (
                    <td className="text-center b3-expand-cell">
                      {isClickable && (
                        <span className={`b3-row-expand-btn${isExpanded ? ' b3-row-expand-open' : ''}`}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 4a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zM7 7.5a.5.5 0 0 1 1 0v3.5a.5.5 0 0 1-1 0V7.5z"/>
                          </svg>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
                {isExpanded && summary && (
                  <tr className="b3-summary-row">
                    <td colSpan={colSpan} className="b3-summary-cell">
                      <div
                        className="b3-summary-content"
                        dangerouslySetInnerHTML={{ __html: summary.summaryHtml }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="best-third-legend mt-2">
        <small>
          <span className="best-third-legend-qualify"></span> Qualifies for Round of 32
          <span className="best-third-legend-out ms-3"></span> Eliminated
        </small>
      </div>
    </div>
  );
}

