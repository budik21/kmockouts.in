import { getDb } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { enumerateGroupScenarios } from '@/engine/scenarios';
import { getCachedGroupProbs, recalculateGroupProbabilities } from '@/lib/probability-cache';
import Link from 'next/link';
import TeamFlag from '@/app/components/TeamFlag';
import QualifyWidgets from '@/app/components/QualifyWidgets';
import ScenariosAccordion from '@/app/components/ScenariosAccordion';
import GroupStandings from '@/app/components/GroupStandings';

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id, name: row.name, shortName: row.short_name,
    countryCode: row.country_code, groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder === 1, externalId: row.external_id ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id, groupId: row.group_id as GroupId, round: row.round,
    homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
    homeGoals: row.home_goals, awayGoals: row.away_goals,
    homeYc: row.home_yc, homeRcDirect: row.home_rc_direct,
    awayYc: row.away_yc, awayRcDirect: row.away_rc_direct,
    venue: row.venue, kickOff: row.kick_off, status: row.status as Match['status'],
  };
}

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ groupId: string; teamId: string }>;
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { groupId: rawGroupId, teamId: rawTeamId } = await params;
  const groupId = rawGroupId.toUpperCase() as GroupId;
  const teamId = parseInt(rawTeamId, 10);

  if (!ALL_GROUPS.includes(groupId)) {
    return <main className="container py-4"><h2>Group not found</h2></main>;
  }

  const db = getDb();
  const teamRows = db.prepare('SELECT * FROM team WHERE group_id = ? ORDER BY id').all(groupId) as TeamRow[];
  const matchRows = db.prepare('SELECT * FROM match WHERE group_id = ? ORDER BY round, kick_off').all(groupId) as MatchRow[];

  const teams = teamRows.map(rowToTeam);
  const allMatches = matchRows.map(rowToMatch);
  const played = allMatches.filter((m) => m.status === 'FINISHED');
  const remaining = allMatches.filter((m) => m.status !== 'FINISHED');

  const team = teams.find((t) => t.id === teamId);
  if (!team) {
    return <main className="container py-4"><h2>Team not found</h2></main>;
  }

  const teamMap = new Map(teams.map((t) => [t.id, { id: t.id, name: t.name, shortName: t.shortName, countryCode: t.countryCode }]));

  // Calculate standings
  const standings = calculateStandings({ teams, matches: played });
  const standingsForDisplay = standings.map((s) => ({
    ...s,
    team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder },
  }));

  // Calculate scenarios
  const summaries = enumerateGroupScenarios(teams, played, remaining);
  const teamSummary = summaries.find((s) => s.teamId === teamId)!;

  const probs = teamSummary.positionProbabilities;
  const qualifyProb = (probs[1] ?? 0) + (probs[2] ?? 0);
  const eliminateProb = (probs[3] ?? 0) + (probs[4] ?? 0);

  // Read cached probabilities for the standings table
  let cachedProbs = getCachedGroupProbs(groupId);
  if (!cachedProbs) {
    recalculateGroupProbabilities(groupId);
    cachedProbs = getCachedGroupProbs(groupId);
  }
  let probabilities: Record<number, { probFirst: number; probSecond: number; probThird: number; probOut: number }> | undefined;
  if (cachedProbs && cachedProbs.size > 0) {
    probabilities = {};
    for (const [tid, cp] of cachedProbs) {
      probabilities[tid] = {
        probFirst: cp.probFirst,
        probSecond: cp.probSecond,
        probThird: cp.probThird,
        probOut: cp.probOut,
      };
    }
  }

  // Enrich edge scenarios with team names and country codes
  const enrichedEdges: { [pos: number]: { shortKey: string; matchResults: { matchId: number; homeTeamId: number; awayTeamId: number; homeGoals: number; awayGoals: number; label: string; homeTeamName: string; homeTeamShort: string; homeCountryCode: string; awayTeamName: string; awayTeamShort: string; awayCountryCode: string }[] }[] } = {};

  for (let pos = 1; pos <= 4; pos++) {
    enrichedEdges[pos] = (teamSummary.edgeScenariosByPosition[pos] ?? []).map((combo) => ({
      shortKey: combo.shortKey,
      matchResults: combo.matchResults.map((mr) => ({
        ...mr,
        homeTeamName: teamMap.get(mr.homeTeamId)?.name ?? '?',
        homeTeamShort: teamMap.get(mr.homeTeamId)?.shortName ?? '?',
        homeCountryCode: teamMap.get(mr.homeTeamId)?.countryCode ?? '',
        awayTeamName: teamMap.get(mr.awayTeamId)?.name ?? '?',
        awayTeamShort: teamMap.get(mr.awayTeamId)?.shortName ?? '?',
        awayCountryCode: teamMap.get(mr.awayTeamId)?.countryCode ?? '',
      })),
    }));
  }

  return (
    <main className="container py-4">
      {/* Header: team name left, breadcrumb right */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h2 className="mb-0">
          <TeamFlag countryCode={team.countryCode} size="md" className="me-2" />
          {team.name}
        </h2>
        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
          <Link href="/">Groups</Link>
          <span className="breadcrumb-sep">/</span>
          <Link href={`/group/${groupId}`}>Group {groupId}</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{team.shortName}</span>
        </nav>
      </div>

      {/* Qualify/Eliminate widgets */}
      <QualifyWidgets
        qualifyProb={qualifyProb}
        eliminateProb={eliminateProb}
        prob1st={probs[1] ?? 0}
        prob2nd={probs[2] ?? 0}
        prob3rd={probs[3] ?? 0}
        prob4th={probs[4] ?? 0}
        totalScenarios={teamSummary.totalScenarios}
        matchesRemaining={remaining.length}
      />

      {/* Current standings */}
      <div className="group-card mb-4">
        <div className="group-card-header">
          <span>Current Standings — Group {groupId}</span>
        </div>
        <div className="group-card-body">
          <GroupStandings standings={standingsForDisplay} groupId={groupId} probabilities={probabilities} />
        </div>
      </div>

      {/* Scenarios accordion */}
      {remaining.length > 0 && (
        <ScenariosAccordion
          edgeScenariosByPosition={enrichedEdges}
          probabilities={probs}
          teamName={team.name}
        />
      )}

      {remaining.length === 0 && (
        <div className="alert alert-success">
          All matches have been played. Final standings are confirmed.
        </div>
      )}
    </main>
  );
}
