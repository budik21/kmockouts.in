import { NextRequest, NextResponse } from 'next/server';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { ALL_GROUPS } from '@/lib/constants';
import { query } from '@/lib/db';
import { enumerateGroupScenarios } from '@/engine/scenarios';

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
    homeYc: row.home_yc, homeYc2: row.home_yc2, homeRcDirect: row.home_rc_direct,
    awayYc: row.away_yc, awayYc2: row.away_yc2, awayRcDirect: row.away_rc_direct,
    venue: row.venue, kickOff: row.kick_off, status: row.status as Match['status'],
  };
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/team-scenarios?group=A&team=1
 * Returns detailed scenario/probability data for a specific team.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('group')?.toUpperCase() as GroupId | undefined;
  const teamId = parseInt(searchParams.get('team') ?? '', 10);

  if (!groupId || !ALL_GROUPS.includes(groupId)) {
    return NextResponse.json({ error: 'Valid group (A-L) required' }, { status: 400 });
  }
  if (isNaN(teamId)) {
    return NextResponse.json({ error: 'Valid team ID required' }, { status: 400 });
  }

  const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
  const matchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

  const teams = teamRows.map(rowToTeam);
  const allMatches = matchRows.map(rowToMatch);
  const played = allMatches.filter((m) => m.status === 'FINISHED');
  const remaining = allMatches.filter((m) => m.status !== 'FINISHED');

  const team = teams.find((t) => t.id === teamId);
  if (!team) {
    return NextResponse.json({ error: 'Team not found in group' }, { status: 404 });
  }

  // Build team map for names
  const teamMap = new Map(teams.map((t) => [t.id, { id: t.id, name: t.name, shortName: t.shortName }]));

  try {
    const summaries = enumerateGroupScenarios(teams, played, remaining);
    const teamSummary = summaries.find((s) => s.teamId === teamId);

    if (!teamSummary) {
      return NextResponse.json({ error: 'Team scenarios not found' }, { status: 404 });
    }

    // Enrich edge scenarios with team names
    const enrichedEdges: { [pos: number]: unknown[] } = {};
    for (let pos = 1; pos <= 4; pos++) {
      enrichedEdges[pos] = (teamSummary.edgeScenariosByPosition[pos] ?? []).map((combo) => ({
        shortKey: combo.shortKey,
        matchResults: combo.matchResults.map((mr) => ({
          ...mr,
          homeTeamName: teamMap.get(mr.homeTeamId)?.name ?? '?',
          homeTeamShort: teamMap.get(mr.homeTeamId)?.shortName ?? '?',
          awayTeamName: teamMap.get(mr.awayTeamId)?.name ?? '?',
          awayTeamShort: teamMap.get(mr.awayTeamId)?.shortName ?? '?',
        })),
      }));
    }

    // Remaining matches enriched
    const remainingEnriched = remaining.map((m) => ({
      id: m.id,
      round: m.round,
      homeTeam: teamMap.get(m.homeTeamId),
      awayTeam: teamMap.get(m.awayTeamId),
      kickOff: m.kickOff,
    }));

    return NextResponse.json({
      team: { id: team.id, name: team.name, shortName: team.shortName },
      groupId,
      probabilities: teamSummary.positionProbabilities,
      totalScenarios: teamSummary.totalScenarios,
      qualifyProbability: (teamSummary.positionProbabilities[1] ?? 0) + (teamSummary.positionProbabilities[2] ?? 0),
      eliminateProbability: (teamSummary.positionProbabilities[3] ?? 0) + (teamSummary.positionProbabilities[4] ?? 0),
      edgeScenariosByPosition: enrichedEdges,
      remainingMatches: remainingEnriched,
      matchesPlayed: played.length,
      matchesRemaining: remaining.length,
    });
  } catch (error) {
    console.error('Team scenarios error:', error);
    return NextResponse.json({ error: 'Calculation failed' }, { status: 500 });
  }
}
