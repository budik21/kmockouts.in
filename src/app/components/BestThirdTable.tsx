'use client';

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

interface BestThirdTableProps {
  teams: ThirdPlacedTeam[];
  /** Per-group qualification probability (e.g. { A: 72.5, B: 45.1, ... }). Shown only when provided. */
  groupProbabilities?: { [groupId: string]: number };
}

function probStyle(prob: number): { background: string; color: string } {
  if (prob <= 0) return { background: '#a31b1b', color: '#ffffff' };
  if (prob >= 80) return { background: '#0a5c2f', color: '#ffffff' };
  if (prob >= 60) return { background: '#1a7a3a', color: '#ffffff' };
  if (prob >= 40) return { background: '#2e9e4e', color: '#ffffff' };
  if (prob >= 20) return { background: '#4db86a', color: '#1a3a1a' };
  return { background: '#7ed69a', color: '#1a3a1a' };
}

export default function BestThirdTable({ teams, groupProbabilities }: BestThirdTableProps) {
  const showProb = !!groupProbabilities;
  return (
    <div className="table-responsive">
      <table className="standings-table table table-sm mb-0">
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
            <th className="text-center">Pts</th>
            <th className="text-center d-none d-sm-table-cell">FP</th>
            {showProb && <th className="text-center">%</th>}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr
              key={t.team.id}
              className={t.rank <= 8 ? 'best-third-qualify' : 'best-third-eliminated'}
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
              <td className="text-center fw-bold">{t.points}</td>
              <td className="text-center d-none d-sm-table-cell">{t.fairPlayPoints}</td>
              {showProb && (
                <td className="text-center">
                  <span
                    className="badge"
                    style={{
                      ...probStyle(groupProbabilities![t.groupId] ?? 0),
                      minWidth: '48px',
                      fontSize: '0.85rem',
                    }}
                  >
                    {(groupProbabilities![t.groupId] ?? 0).toFixed(1)}
                  </span>
                </td>
              )}
            </tr>
          ))}
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
