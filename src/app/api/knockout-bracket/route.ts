import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { resolveKnockoutBracket } from '@/engine/knockout-resolver';
import { ALL_GROUPS } from '@/lib/constants';

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    countryCode: row.country_code,
    groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder,
    externalId: row.external_id ?? undefined,
    fifaRanking: row.fifa_ranking ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    groupId: row.group_id as GroupId,
    round: row.round,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    homeYc: row.home_yc,
    homeYc2: row.home_yc2,
    homeRcDirect: row.home_rc_direct,
    homeYcRc: row.home_yc_rc,
    awayYc: row.away_yc,
    awayYc2: row.away_yc2,
    awayRcDirect: row.away_rc_direct,
    awayYcRc: row.away_yc_rc,
    venue: row.venue,
    kickOff: row.kick_off,
    status: row.status as Match['status'],
  };
}

export async function GET() {
  const groupStates = [];

  for (const gid of ALL_GROUPS) {
    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const allMatchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round', [gid]);
    const finishedMatchRows = allMatchRows.filter(m => m.status === 'FINISHED');

    const teams = teamRows.map(rowToTeam);
    const finishedMatches = finishedMatchRows.map(rowToMatch);
    const standings = calculateStandings({ teams, matches: finishedMatches });

    groupStates.push({
      groupId: gid as GroupId,
      teams,
      standings,
      matchesPlayed: finishedMatchRows.length,
      totalMatches: allMatchRows.length,
    });
  }

  const bracket = await resolveKnockoutBracket(groupStates);

  return NextResponse.json(bracket, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
