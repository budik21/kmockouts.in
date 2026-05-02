'use client';

import { useRouter } from 'next/navigation';
import { slugify } from '@/lib/slugify';
import TeamFlag from './TeamFlag';
import ProbabilityCircle from './ProbabilityCircle';

interface TeamStandingData {
  position: number;
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
}

export interface TeamProbData {
  probFirst: number;
  probSecond: number;
  probThird: number;
  probOut: number;
}

interface GroupStandingsProps {
  standings: TeamStandingData[];
  compact?: boolean;
  /** When true (and not compact), drops MP/GF/GA columns to keep the
   * table narrow enough for the side column on the group detail page. */
  narrow?: boolean;
  groupId?: string;
  /** Record<teamId, probabilities> — shows probability circles when provided */
  probabilities?: Record<number, TeamProbData>;
  /** When true, adds visual simulation indicator to the table */
  isSimulated?: boolean;
  /** When set, the row for this team is visually highlighted (used on team
   *  detail pages so the visitor sees their team picked out in the table). */
  focusTeamId?: number;
}

function TeamNameContent({ team }: { team: TeamStandingData['team'] }) {
  return (
    <>
      <TeamFlag countryCode={team.countryCode} />
      <span className="team-name-full">{team.name}</span>
      <span className="team-short" title={team.name}>{team.shortName}</span>
      {team.fifaRanking && (
        <span className="standings-ranking" title="FIFA Ranking">({team.fifaRanking})</span>
      )}
    </>
  );
}

export default function GroupStandings({ standings, compact = false, narrow = false, groupId, probabilities, isSimulated = false, focusTeamId }: GroupStandingsProps) {
  const router = useRouter();

  const handleRowClick = groupId
    ? (teamName: string) => router.push(`/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(teamName)}`)
    : undefined;

  const rowProps = (teamName: string) =>
    handleRowClick
      ? {
          onClick: () => handleRowClick(teamName),
          style: { cursor: 'pointer' } as React.CSSProperties,
          className: 'standings-row-clickable',
        }
      : {};

  const hasProbs = probabilities && Object.keys(probabilities).length > 0;
  const allTeamsPlayed = standings.every((s) => s.matchesPlayed > 0);

  if (compact) {
    return (
      <table className="standings-table table table-sm mb-0">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th className="text-center">MP</th>
            <th className="text-center">GD</th>
            <th className="text-center standings-pts-col">Pts</th>
            {hasProbs && <th className="text-center">%</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const prob = probabilities?.[s.team.id];
            return (
              <tr key={s.team.id} className={`pos-${s.position}${focusTeamId === s.team.id ? ' standings-row-focus' : ''}`} {...rowProps(s.team.name)}>
                <td>{s.position}</td>
                <td className="team-name">
                  <TeamNameContent team={s.team} />
                </td>
                <td className="text-center">{s.matchesPlayed}</td>
                <td className="text-center">{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                <td className="text-center fw-bold standings-pts-col">{s.points}</td>
                {hasProbs && (
                  <td className="text-center">
                    {prob && (
                      <ProbabilityCircle
                        qualifyProb={prob.probFirst + prob.probSecond}
                        probFirst={prob.probFirst}
                        probSecond={prob.probSecond}
                        probThird={prob.probThird}
                        probOut={prob.probOut}
                        disabled={!allTeamsPlayed}
                      />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="table-responsive">
      <table className={`standings-table table table-sm mb-0 ${isSimulated ? 'sim-table' : ''}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th className="text-center">MP</th>
            <th className="text-center">W</th>
            <th className="text-center">D</th>
            <th className="text-center">L</th>
            {!narrow && <th className="text-center">GF</th>}
            {!narrow && <th className="text-center">GA</th>}
            <th className="text-center">GD</th>
            <th className="text-center standings-pts-col">Pts</th>
            {hasProbs && <th className="text-center">%</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const prob = probabilities?.[s.team.id];
            return (
              <tr key={s.team.id} className={`pos-${s.position}${focusTeamId === s.team.id ? ' standings-row-focus' : ''}`} {...rowProps(s.team.name)}>
                <td>{s.position}</td>
                <td className="team-name">
                  <TeamNameContent team={s.team} />
                </td>
                <td className="text-center">{s.matchesPlayed}</td>
                <td className="text-center">{s.wins}</td>
                <td className="text-center">{s.draws}</td>
                <td className="text-center">{s.losses}</td>
                {!narrow && <td className="text-center">{s.goalsFor}</td>}
                {!narrow && <td className="text-center">{s.goalsAgainst}</td>}
                <td className="text-center">{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                <td className="text-center fw-bold standings-pts-col">{s.points}</td>
                {hasProbs && (
                  <td className="text-center">
                    {prob && (
                      <ProbabilityCircle
                        qualifyProb={prob.probFirst + prob.probSecond}
                        probFirst={prob.probFirst}
                        probSecond={prob.probSecond}
                        probThird={prob.probThird}
                        probOut={prob.probOut}
                        disabled={!allTeamsPlayed}
                      />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
