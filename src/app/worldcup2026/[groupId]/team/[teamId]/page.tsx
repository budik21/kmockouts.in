import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { enumerateGroupScenarios } from '@/engine/scenarios';
import { getCachedGroupProbs, recalculateGroupProbabilities } from '@/lib/probability-cache';
import { compareThirdPlaced } from '@/engine/best-third';
import { generateScenarioSummaries } from '@/engine/scenario-summary';
import Link from 'next/link';
import type { Metadata } from 'next';
import { slugify } from '@/lib/slugify';
import TeamFlag from '@/app/components/TeamFlag';
import QualifyWidgets from '@/app/components/QualifyWidgets';
import ScenariosAccordion from '@/app/components/ScenariosAccordion';
import GroupStandings from '@/app/components/GroupStandings';
import MatchList from '@/app/components/MatchList';

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

/** Extract group letter from slug like "group-a" → "A" */
function parseGroupSlug(slug: string): GroupId | null {
  const match = slug.match(/^group-([a-l])$/i);
  if (!match) return null;
  const groupId = match[1].toUpperCase() as GroupId;
  return ALL_GROUPS.includes(groupId) ? groupId : null;
}

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ groupId: string; teamId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { groupId: slug, teamId: rawTeamId } = await params;
  const groupId = parseGroupSlug(slug);
  if (!groupId) return { title: 'Team not found' };
  const rows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1', [groupId]);
  const team = rows.find((r) => slugify(r.name) === rawTeamId.toLowerCase());
  if (!team) return { title: 'Team not found' };
  return {
    title: `${team.name} — Group ${groupId} | FIFA World Cup 2026`,
    description: `Track ${team.name}'s qualification scenarios, standings, and match results in Group ${groupId} of the FIFA World Cup 2026.`,
  };
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { groupId: slug, teamId: rawTeamId } = await params;
  const groupId = parseGroupSlug(slug);

  if (!groupId) {
    return <main className="container py-4"><h2>Group not found</h2></main>;
  }

  const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
  const matchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

  const teams = teamRows.map(rowToTeam);
  const allMatches = matchRows.map(rowToMatch);
  const played = allMatches.filter((m) => m.status === 'FINISHED');
  const remaining = allMatches.filter((m) => m.status !== 'FINISHED');

  const team = teams.find((t) => slugify(t.name) === rawTeamId.toLowerCase());
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
  const teamSummary = summaries.find((s) => s.teamId === team.id)!;

  const probs = teamSummary.positionProbabilities;
  const qualifyProb = (probs[1] ?? 0) + (probs[2] ?? 0) + (probs[3] ?? 0);
  const eliminateProb = probs[4] ?? 0;

  // Read cached probabilities for the standings table
  let cachedProbs = await getCachedGroupProbs(groupId);
  if (!cachedProbs) {
    await recalculateGroupProbabilities(groupId);
    cachedProbs = await getCachedGroupProbs(groupId);
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

  // Compute best-3rd ranking (current snapshot across all groups)
  let bestThirdRank: number | null = null;
  let bestThirdQualifies = false;
  const currentPosition = standings.find((s) => s.team.id === team.id)?.position ?? null;
  const isCurrentlyThird = currentPosition === 3;
  if ((probs[3] ?? 0) > 0 && isCurrentlyThird) {
    const thirdPlaced: { groupId: GroupId; standing: typeof standings[0] }[] = [];
    for (const gid of ALL_GROUPS) {
      if (gid === groupId) {
        const third = standings.find((s) => s.position === 3);
        if (third) thirdPlaced.push({ groupId: gid, standing: third });
      } else {
        const gTeamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
        const gMatchRows = await query<MatchRow>(
          "SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round",
          [gid],
        );
        const gTeams = gTeamRows.map(rowToTeam);
        const gMatches = gMatchRows.map(rowToMatch);
        const gStandings = calculateStandings({ teams: gTeams, matches: gMatches });
        const third = gStandings.find((s) => s.position === 3);
        if (third) thirdPlaced.push({ groupId: gid, standing: third });
      }
    }
    thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));
    const idx = thirdPlaced.findIndex((tp) => tp.groupId === groupId);
    if (idx !== -1) {
      bestThirdRank = idx + 1;
      bestThirdQualifies = bestThirdRank <= 8;
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

  // Generate scenario summaries
  const remainingMatchesInfo = remaining.map((m, i) => ({
    matchIndex: i,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: teamMap.get(m.homeTeamId)?.name ?? '?',
    awayTeamName: teamMap.get(m.awayTeamId)?.name ?? '?',
  }));
  const scenarioSummaries = generateScenarioSummaries(
    team.id,
    team.name,
    teamSummary.outcomePatternsByPosition,
    remainingMatchesInfo,
    probs,
  );

  const groupSlug = `group-${groupId.toLowerCase()}`;

  return (
    <main className="container py-4">
      {/* Header: team name left, breadcrumb right */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h2 className="mb-0">
          <TeamFlag countryCode={team.countryCode} size="md" className="me-2" />
          {team.name}
        </h2>
        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
          <Link href="/worldcup2026">Groups</Link>
          <span className="breadcrumb-sep">/</span>
          <Link href={`/worldcup2026/${groupSlug}`}>Group {groupId}</Link>
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
        teamName={team.name}
        bestThirdRank={bestThirdRank}
        bestThirdQualifies={bestThirdQualifies}
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
          summaries={scenarioSummaries}
        />
      )}

      {remaining.length === 0 && (
        <div className="alert alert-success">
          All matches have been played. Final standings are confirmed.
        </div>
      )}

      {/* Team matches */}
      {(() => {
        const teamMatches = allMatches
          .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
          .map((m) => ({
            id: m.id,
            round: m.round,
            homeTeam: {
              id: m.homeTeamId,
              name: teamMap.get(m.homeTeamId)?.name ?? '?',
              shortName: teamMap.get(m.homeTeamId)?.shortName ?? '?',
              countryCode: teamMap.get(m.homeTeamId)?.countryCode ?? '',
            },
            awayTeam: {
              id: m.awayTeamId,
              name: teamMap.get(m.awayTeamId)?.name ?? '?',
              shortName: teamMap.get(m.awayTeamId)?.shortName ?? '?',
              countryCode: teamMap.get(m.awayTeamId)?.countryCode ?? '',
            },
            homeGoals: m.homeGoals,
            awayGoals: m.awayGoals,
            venue: m.venue,
            kickOff: m.kickOff,
            status: m.status,
          }));
        return teamMatches.length > 0 ? (
          <div className="group-card mb-4">
            <div className="group-card-header">
              <span>Matches</span>
            </div>
            <div className="group-card-body">
              <MatchList matches={teamMatches} />
            </div>
          </div>
        ) : null;
      })()}

      {/* SEO text */}
      <p className="text-muted mt-4" style={{ fontSize: '0.9rem' }}>
        Follow {team.name}&apos;s journey in Group {groupId} of the FIFA World Cup 2026.
        See current standings, qualification probability, and all possible scenarios for advancing to the knockout stage.
      </p>
    </main>
  );
}
