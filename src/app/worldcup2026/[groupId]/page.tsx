import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { getCachedGroupProbs, recalculateGroupProbabilities } from '@/lib/probability-cache';
import GroupDetailClient from './GroupDetailClient';
import Link from 'next/link';
import type { Metadata } from 'next';

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

/** Extract group letter from slug like "group-a" → "A" */
function parseGroupSlug(slug: string): GroupId | null {
  const match = slug.match(/^group-([a-l])$/i);
  if (!match) return null;
  const groupId = match[1].toUpperCase() as GroupId;
  return ALL_GROUPS.includes(groupId) ? groupId : null;
}

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { groupId: slug } = await params;
  const groupId = parseGroupSlug(slug);
  if (!groupId) return { title: 'Group not found' };
  return {
    title: `Group ${groupId} Standings & Scenarios | FIFA World Cup 2026`,
    description: `Live standings, match results, and qualification probabilities for Group ${groupId} of the FIFA World Cup 2026 in Canada, Mexico & USA.`,
  };
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { groupId: slug } = await params;
  const groupId = parseGroupSlug(slug);

  if (!groupId) {
    return (
      <main className="container py-4">
        <h2>Group not found</h2>
        <p>Valid groups: A through L</p>
        <Link href="/worldcup2026" className="btn btn-primary">Back to overview</Link>
      </main>
    );
  }

  const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
  const matchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

  const teams = teamRows.map(rowToTeam);
  const allMatches = matchRows.map(rowToMatch);
  const finishedMatches = allMatches.filter((m) => m.status === 'FINISHED');

  const standings = calculateStandings({ teams, matches: finishedMatches });

  // Build team map for match display
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const matchesForDisplay = allMatches.map((m) => ({
    id: m.id,
    round: m.round,
    homeTeam: { id: m.homeTeamId, name: teamMap.get(m.homeTeamId)?.name ?? '?', shortName: teamMap.get(m.homeTeamId)?.shortName ?? '?', countryCode: teamMap.get(m.homeTeamId)?.countryCode ?? '', fifaRanking: teamMap.get(m.homeTeamId)?.fifaRanking },
    awayTeam: { id: m.awayTeamId, name: teamMap.get(m.awayTeamId)?.name ?? '?', shortName: teamMap.get(m.awayTeamId)?.shortName ?? '?', countryCode: teamMap.get(m.awayTeamId)?.countryCode ?? '', fifaRanking: teamMap.get(m.awayTeamId)?.fifaRanking },
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    homeYc: m.homeYc,
    homeYc2: m.homeYc2,
    homeRcDirect: m.homeRcDirect,
    homeYcRc: m.homeYcRc,
    awayYc: m.awayYc,
    awayYc2: m.awayYc2,
    awayRcDirect: m.awayRcDirect,
    awayYcRc: m.awayYcRc,
    venue: m.venue,
    kickOff: m.kickOff,
    status: m.status,
  }));

  const standingsForDisplay = standings.map((s) => ({
    ...s,
    team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder, fifaRanking: s.team.fifaRanking },
  }));

  // Read cached probabilities (compute if missing)
  let cachedProbs = await getCachedGroupProbs(groupId);
  if (!cachedProbs) {
    await recalculateGroupProbabilities(groupId);
    cachedProbs = await getCachedGroupProbs(groupId);
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
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <nav className="group-switcher" aria-label="Switch group">
            {ALL_GROUPS.map((gid) => (
              <Link
                key={gid}
                href={`/worldcup2026/group-${gid.toLowerCase()}`}
                className={`group-switcher-item${gid === groupId ? ' active' : ''}`}
              >
                {gid}
              </Link>
            ))}
          </nav>
          <nav className="breadcrumb-nav" aria-label="Breadcrumb">
            <Link href="/worldcup2026">Home</Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Group {groupId}</span>
          </nav>
        </div>
      </div>

      <GroupDetailClient
        groupId={groupId}
        standings={standingsForDisplay}
        matches={matchesForDisplay}
        probabilities={probabilities}
        teams={teams}
        fullMatches={allMatches}
        finishedCount={finishedMatches.length}
        totalCount={allMatches.length}
      />

      {/* SEO text */}
      <p className="text-muted mt-4" style={{ fontSize: '0.9rem' }}>
        Group {groupId} of the FIFA World Cup 2026 features {teams.map((t) => t.name).join(', ')}.
        The top 2 teams qualify automatically for the Round of 32, while the 3rd-placed team may advance
        as one of the 8 best third-placed teams across all 12 groups.
      </p>
    </main>
  );
}
