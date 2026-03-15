'use client';

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
}

export default function BestThirdTable({ teams }: BestThirdTableProps) {
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
                <TeamFlag countryCode={t.team.countryCode} />
                <span className="team-name-full">{t.team.name}</span>
                <span className="team-short">{t.team.shortName}</span>
              </td>
              <td className="text-center d-none d-sm-table-cell">{t.groupId}</td>
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
