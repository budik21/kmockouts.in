import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { enumerateGroupScenarios } from '@/engine/scenarios';

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id, name: row.name, shortName: row.short_name,
    countryCode: row.country_code, groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder, externalId: row.external_id ?? undefined,
    fifaRanking: row.fifa_ranking ?? undefined,
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

interface SimulatedScore {
  matchId: number;
  homeGoals: number;
  awayGoals: number;
}

/**
 * POST /api/simulate
 * Accepts user-simulated scores for SCHEDULED matches and returns
 * recalculated probabilities without writing to the database.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const groupId = (body.groupId as string)?.toUpperCase() as GroupId;
    const simulatedScores: SimulatedScore[] = body.simulatedScores ?? [];

    if (!groupId || !ALL_GROUPS.includes(groupId)) {
      return NextResponse.json({ error: 'Valid groupId (A-L) required.' }, { status: 400 });
    }

    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
    const matchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

    const teams = teamRows.map(rowToTeam);
    const allMatches = matchRows.map(rowToMatch);

    // Build a lookup of user-simulated scores keyed by matchId
    const simMap = new Map(simulatedScores.map((s) => [s.matchId, s]));

    const playedMatches: Match[] = [];
    const remainingMatches: Match[] = [];

    for (const m of allMatches) {
      if (m.status === 'FINISHED') {
        // Real finished matches are always played
        playedMatches.push(m);
      } else if (simMap.has(m.id)) {
        // User provided a simulated score for this scheduled match
        const sim = simMap.get(m.id)!;
        playedMatches.push({
          ...m,
          homeGoals: sim.homeGoals,
          awayGoals: sim.awayGoals,
          status: 'FINISHED',
        });
      } else {
        // No simulation — still remaining
        remainingMatches.push(m);
      }
    }

    const summaries = enumerateGroupScenarios(teams, playedMatches, remainingMatches);

    const probabilities: Record<number, { probFirst: number; probSecond: number; probThird: number; probOut: number }> = {};
    for (const s of summaries) {
      probabilities[s.teamId] = {
        probFirst: s.positionProbabilities[1] ?? 0,
        probSecond: s.positionProbabilities[2] ?? 0,
        probThird: s.positionProbabilities[3] ?? 0,
        probOut: s.positionProbabilities[4] ?? 0,
      };
    }

    return NextResponse.json({ groupId, probabilities });
  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json({ error: 'Failed to calculate simulation' }, { status: 500 });
  }
}
