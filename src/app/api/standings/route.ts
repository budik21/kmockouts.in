import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { ALL_GROUPS } from '@/lib/constants';

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    countryCode: row.country_code,
    groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder === 1,
    externalId: row.external_id ?? undefined,
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
    homeRcDirect: row.home_rc_direct,
    awayYc: row.away_yc,
    awayRcDirect: row.away_rc_direct,
    venue: row.venue,
    kickOff: row.kick_off,
    status: row.status as Match['status'],
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('group')?.toUpperCase() as GroupId | undefined;

  if (groupId && !ALL_GROUPS.includes(groupId)) {
    return NextResponse.json({ error: 'Invalid group. Use A-L.' }, { status: 400 });
  }

  const db = getDb();
  const groups = groupId ? [groupId] : ALL_GROUPS;
  const result: Record<string, unknown> = {};

  for (const gid of groups) {
    const teamRows = db.prepare('SELECT * FROM team WHERE group_id = ? ORDER BY id').all(gid) as TeamRow[];
    const matchRows = db.prepare("SELECT * FROM match WHERE group_id = ? AND status = 'FINISHED' ORDER BY round").all(gid) as MatchRow[];

    const teams = teamRows.map(rowToTeam);
    const matches = matchRows.map(rowToMatch);
    const standings = calculateStandings({ teams, matches });

    result[gid] = {
      groupId: gid,
      standings: standings.map((s) => ({
        position: s.position,
        team: s.team,
        matchesPlayed: s.matchesPlayed,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: s.goalDifference,
        points: s.points,
        fairPlayPoints: s.fairPlayPoints,
      })),
    };
  }

  return NextResponse.json(groupId ? result[groupId] : result);
}
