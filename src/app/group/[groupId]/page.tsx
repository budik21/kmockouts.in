import { getDb } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { getCachedGroupProbs, recalculateGroupProbabilities } from '@/lib/probability-cache';
import GroupStandings from '@/app/components/GroupStandings';
import MatchList from '@/app/components/MatchList';
import Link from 'next/link';

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
  params: Promise<{ groupId: string }>;
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { groupId: rawGroupId } = await params;
  const groupId = rawGroupId.toUpperCase() as GroupId;

  if (!ALL_GROUPS.includes(groupId)) {
    return (
      <main className="container py-4">
        <h2>Group not found</h2>
        <p>Valid groups: A through L</p>
        <Link href="/" className="btn btn-primary">Back to overview</Link>
      </main>
    );
  }

  const db = getDb();
  const teamRows = db.prepare('SELECT * FROM team WHERE group_id = ? ORDER BY id').all(groupId) as TeamRow[];
  const matchRows = db.prepare('SELECT * FROM match WHERE group_id = ? ORDER BY round, kick_off').all(groupId) as MatchRow[];

  const teams = teamRows.map(rowToTeam);
  const allMatches = matchRows.map(rowToMatch);
  const finishedMatches = allMatches.filter((m) => m.status === 'FINISHED');

  const standings = calculateStandings({ teams, matches: finishedMatches });

  // Build team map for match display
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const matchesForDisplay = allMatches.map((m) => ({
    id: m.id,
    round: m.round,
    homeTeam: { id: m.homeTeamId, name: teamMap.get(m.homeTeamId)?.name ?? '?', shortName: teamMap.get(m.homeTeamId)?.shortName ?? '?', countryCode: teamMap.get(m.homeTeamId)?.countryCode ?? '' },
    awayTeam: { id: m.awayTeamId, name: teamMap.get(m.awayTeamId)?.name ?? '?', shortName: teamMap.get(m.awayTeamId)?.shortName ?? '?', countryCode: teamMap.get(m.awayTeamId)?.countryCode ?? '' },
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    venue: m.venue,
    kickOff: m.kickOff,
    status: m.status,
  }));

  const standingsForDisplay = standings.map((s) => ({
    ...s,
    team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder },
  }));

  // Read cached probabilities (compute if missing)
  let cachedProbs = getCachedGroupProbs(groupId);
  if (!cachedProbs) {
    recalculateGroupProbabilities(groupId);
    cachedProbs = getCachedGroupProbs(groupId);
  }
  let probabilities: Record<number, { probFirst: number; probSecond: number; probThird: number; probOut: number }> | undefined;
  if (cachedProbs && cachedProbs.size > 0) {
    probabilities = {};
    for (const [teamId, cp] of cachedProbs) {
      probabilities[teamId] = {
        probFirst: cp.probFirst,
        probSecond: cp.probSecond,
        probThird: cp.probThird,
        probOut: cp.probOut,
      };
    }
  }

  return (
    <main className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h2 className="mb-0">Group {groupId}</h2>
        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
          <Link href="/">Groups</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">Group {groupId}</span>
        </nav>
      </div>

      {/* Standings */}
      <div className="group-card mb-4">
        <div className="group-card-header">
          <span>Standings</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            {finishedMatches.length} of {allMatches.length} matches played
          </span>
        </div>
        <div className="group-card-body">
          <GroupStandings standings={standingsForDisplay} groupId={groupId} probabilities={probabilities} />
        </div>
      </div>

      {/* Qualification info */}
      <div className="alert alert-info mb-4" role="alert" style={{ fontSize: '0.85rem' }}>
        <strong>Qualification:</strong> Top 2 teams qualify automatically.
        3rd-placed team may qualify as one of the 8 best third-placed teams across all 12 groups.
      </div>

      {/* Matches */}
      <div className="group-card">
        <div className="group-card-header">Matches</div>
        <div className="group-card-body">
          <MatchList matches={matchesForDisplay} />
        </div>
      </div>
    </main>
  );
}
