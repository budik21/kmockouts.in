import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match, TeamStanding } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { compareThirdPlaced } from '@/engine/best-third';
import BestThirdTable from '@/app/components/BestThirdTable';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Best Third-Placed Teams | FIFA World Cup 2026',
  description: '8 of 12 third-placed teams qualify for the Round of 32 at FIFA World Cup 2026.',
};

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id, name: row.name, shortName: row.short_name,
    countryCode: row.country_code, groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder, externalId: row.external_id ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id, groupId: row.group_id as GroupId, round: row.round,
    homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
    homeGoals: row.home_goals, awayGoals: row.away_goals,
    homeYc: row.home_yc, homeYc2: row.home_yc2, homeRcDirect: row.home_rc_direct, homeYcRc: row.home_yc_rc,
    awayYc: row.away_yc, awayYc2: row.away_yc2, awayRcDirect: row.away_rc_direct, awayYcRc: row.away_yc_rc,
    venue: row.venue, kickOff: row.kick_off, status: row.status as Match['status'],
  };
}

export default async function BestThirdPlacedPage() {
  // Collect third-placed team from each group
  const thirdPlaced: { groupId: GroupId; standing: TeamStanding }[] = [];
  let groupsWithMatches = 0;

  for (const gid of ALL_GROUPS) {
    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const matchRows = await query<MatchRow>(
      "SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round",
      [gid],
    );
    const teams = teamRows.map(rowToTeam);
    const matches = matchRows.map(rowToMatch);

    if (matches.length > 0) {
      groupsWithMatches++;
    }

    const standings = calculateStandings({ teams, matches });
    const third = standings.find((s) => s.position === 3);
    if (third) {
      thirdPlaced.push({ groupId: gid, standing: third });
    }
  }

  // Sort by FIFA criteria
  thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

  const showTable = groupsWithMatches >= 12;

  const tableData = thirdPlaced.map((tp, i) => ({
    rank: i + 1,
    groupId: tp.groupId,
    team: {
      id: tp.standing.team.id,
      name: tp.standing.team.name,
      shortName: tp.standing.team.shortName,
      countryCode: tp.standing.team.countryCode,
      isPlaceholder: tp.standing.team.isPlaceholder,
    },
    matchesPlayed: tp.standing.matchesPlayed,
    wins: tp.standing.wins,
    draws: tp.standing.draws,
    losses: tp.standing.losses,
    goalsFor: tp.standing.goalsFor,
    goalsAgainst: tp.standing.goalsAgainst,
    goalDifference: tp.standing.goalDifference,
    points: tp.standing.points,
    fairPlayPoints: tp.standing.fairPlayPoints,
  }));

  return (
    <main className="container py-4">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Groups</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Best Third-Placed Teams
          </li>
        </ol>
      </nav>

      <h1 className="mb-1">Best Third-Placed Teams</h1>
      <p className="text-muted mb-4">
        8 of 12 third-placed teams qualify for the Round of 32
      </p>

      {showTable ? (
        <div className="group-card">
          <div className="group-card-header">
            <span>Third-Placed Teams Ranking</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              {groupsWithMatches}/12 groups with results
            </span>
          </div>
          <div className="group-card-body">
            <BestThirdTable teams={tableData} />
          </div>
        </div>
      ) : (
        <div className="best-third-info-box">
          <p className="mb-0">
            The third-placed teams table will be displayed after the first round of matches is completed.
          </p>
          <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.85rem' }}>
            {groupsWithMatches}/12 groups have results so far.
          </p>
        </div>
      )}
    </main>
  );
}
