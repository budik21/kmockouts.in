import { cachedQuery } from '@/lib/cached-db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match, TeamStanding } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { compareThirdPlaced } from '@/engine/best-third';
import { getCachedBestThirdProbabilities, getCachedQualificationThreshold } from '@/engine/probability';
import { getAllCachedProbs } from '@/lib/probability-cache';
import BestThirdTable from '@/app/components/BestThirdTable';
import ThirdPlacedMatchesGrid from '@/app/components/ThirdPlacedMatchesGrid';
import { generateBestThirdSummaries, BestThirdTeamContext } from '@/engine/best-third-summary-ai';
import QualificationThresholdBox from '@/app/components/QualificationThreshold';
import Link from 'next/link';
import type { Metadata } from 'next';
import AdBanner from '@/app/components/AdBanner';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

const AD_SLOT_BEST_THIRD = 'XXXXXXXXXX';  // TODO: replace with real slot ID

// Tag-based on-demand revalidation via `revalidateTag(WC_TAG)`. See cache-tags.ts.

export const metadata: Metadata = {
  title:
    'Best Third-Placed Teams — Play-Off Qualifiers | FIFA World Cup 2026',
  description:
    'Live ranking of the 12 third-placed teams at the FIFA World Cup 2026. The 8 best advance from the play-off to the knockout Round of 32. Points, goal difference, fair play and FIFA ranking tiebreakers.',
  keywords: [
    'best third placed teams',
    'World Cup 2026 play-off',
    'World Cup 2026 third place ranking',
    'Round of 32 qualifiers',
    'FIFA World Cup 2026 third-placed',
    'soccer play-off',
  ],
  alternates: { canonical: '/worldcup2026/best-third-placed' },
  openGraph: {
    title: 'Best Third-Placed Teams — Play-Off Qualifiers | World Cup 2026',
    description:
      'Live ranking of the 12 third-placed teams. The 8 best advance from the play-off to the FIFA World Cup 2026 knockout Round of 32.',
    url: `${SITE_URL}/worldcup2026/best-third-placed`,
  },
};

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

export default async function BestThirdPlacedPage() {
  // Collect third-placed team from each group + their matches
  const thirdPlaced: { groupId: GroupId; standing: TeamStanding; teamMatches: { opponentName: string; opponentShort: string; opponentCode: string; isHome: boolean; homeGoals: number | null; awayGoals: number | null; status: string; round: number; venue: string; kickOff: string }[] }[] = [];
  let groupsWithMatches = 0;
  let allTeamsPlayedTwo = true; // Track if every team across all groups has ≥2 matches
  let hasRemainingMatches = false; // Track if any group still has unplayed matches

  for (const gid of ALL_GROUPS) {
    const teamRows = await cachedQuery<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const finishedRows = await cachedQuery<MatchRow>(
      "SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round",
      [gid],
    );
    const allMatchRows = await cachedQuery<MatchRow>(
      'SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off',
      [gid],
    );
    const teams = teamRows.map(rowToTeam);
    const finishedMatches = finishedRows.map(rowToMatch);
    const allMatches = allMatchRows.map(rowToMatch);

    if (finishedMatches.length > 0) {
      groupsWithMatches++;
    }
    if (allMatches.length > finishedMatches.length) {
      hasRemainingMatches = true;
    }

    // Check if every team in this group has played at least 2 matches
    if (allTeamsPlayedTwo) {
      for (const t of teams) {
        const teamMatchCount = finishedMatches.filter(m => m.homeTeamId === t.id || m.awayTeamId === t.id).length;
        if (teamMatchCount < 2) {
          allTeamsPlayedTwo = false;
          break;
        }
      }
    }

    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const standings = calculateStandings({ teams, matches: finishedMatches });
    const third = standings.find((s) => s.position === 3);
    if (third) {
      const teamId = third.team.id;
      const teamMatches = allMatches
        .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
        .map((m) => {
          const isHome = m.homeTeamId === teamId;
          const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
          const opponent = teamMap.get(opponentId);
          return {
            opponentName: opponent?.name ?? '?',
            opponentShort: opponent?.shortName ?? '?',
            opponentCode: opponent?.countryCode ?? '',
            isHome,
            homeGoals: m.homeGoals,
            awayGoals: m.awayGoals,
            status: m.status,
            round: m.round,
            venue: m.venue,
            kickOff: m.kickOff,
          };
        });
      thirdPlaced.push({ groupId: gid, standing: third, teamMatches });
    }
  }

  // Sort by FIFA criteria
  thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

  const showTable = groupsWithMatches >= 12;

  // Load per-group best-third probabilities (only shown when all teams have ≥2 matches)
  let bestThirdProbs: Map<string, number> | null = null;
  let qualificationThreshold: import('@/engine/best-third').QualificationThreshold | null = null;
  let allTeamProbs: Map<string, Map<number, import('@/lib/probability-cache').CachedTeamProb>> | null = null;
  if (allTeamsPlayedTwo) {
    try {
      [bestThirdProbs, qualificationThreshold, allTeamProbs] = await Promise.all([
        getCachedBestThirdProbabilities(),
        getCachedQualificationThreshold(),
        getAllCachedProbs(),
      ]);
    } catch {
      // Table might not exist yet
    }
  }

  const tableData = thirdPlaced.map((tp, i) => ({
    rank: i + 1,
    groupId: tp.groupId,
    team: {
      id: tp.standing.team.id,
      name: tp.standing.team.name,
      shortName: tp.standing.team.shortName,
      countryCode: tp.standing.team.countryCode,
      isPlaceholder: tp.standing.team.isPlaceholder,
      fifaRanking: tp.standing.team.fifaRanking,
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

  const matchesGridData = thirdPlaced.map((tp, i) => ({
    rank: i + 1,
    groupId: tp.groupId,
    team: {
      name: tp.standing.team.name,
      shortName: tp.standing.team.shortName,
      countryCode: tp.standing.team.countryCode,
    },
    matches: tp.teamMatches,
  }));

  // Generate AI summaries for best-third teams (only when probabilities are available)
  let summariesData: { teamId: number; teamName: string; teamShort: string; countryCode: string; groupId: string; qualProbability: number; summaryHtml: string }[] = [];
  if (showTable && bestThirdProbs && allTeamsPlayedTwo) {
    // Look up per-team probThirdQual (more accurate than per-group)
    const getTeamQualProb = (groupId: string, teamId: number): number => {
      const groupCache = allTeamProbs?.get(groupId);
      if (groupCache) {
        const teamProb = groupCache.get(teamId);
        if (teamProb && teamProb.probThirdQual > 0) return teamProb.probThirdQual;
      }
      // Fallback to per-group probability
      return bestThirdProbs!.get(groupId) ?? 0;
    };

    const aiTeams: BestThirdTeamContext[] = thirdPlaced.map((tp, i) => {
      const remaining = tp.teamMatches.find(m => m.status !== 'FINISHED');
      return {
        teamName: tp.standing.team.name,
        teamId: tp.standing.team.id,
        groupId: tp.groupId,
        currentRank: i + 1,
        points: tp.standing.points,
        goalDifference: tp.standing.goalDifference,
        goalsFor: tp.standing.goalsFor,
        qualProbability: getTeamQualProb(tp.groupId, tp.standing.team.id),
        remainingMatch: remaining ? { opponent: remaining.opponentName } : null,
      };
    });

    try {
      const aiSummaries = await generateBestThirdSummaries(aiTeams, qualificationThreshold);
      summariesData = thirdPlaced
        .map((tp) => {
          const html = aiSummaries.get(tp.standing.team.id);
          if (!html) return null;
          return {
            teamId: tp.standing.team.id,
            teamName: tp.standing.team.name,
            teamShort: tp.standing.team.shortName,
            countryCode: tp.standing.team.countryCode,
            groupId: tp.groupId,
            qualProbability: getTeamQualProb(tp.groupId, tp.standing.team.id),
            summaryHtml: html,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    } catch (err) {
      console.error('Best-third AI summaries failed:', err);
    }
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/worldcup2026`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Best Third-Placed Teams',
        item: `${SITE_URL}/worldcup2026/best-third-placed`,
      },
    ],
  };

  return (
    <main className="container py-4">
      <JsonLd data={breadcrumbJsonLd} />

      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Best Third-Placed Teams
          </li>
        </ol>
      </nav>

      <h1 className="mb-1">Best Third-Placed Teams — FIFA World Cup 2026 Play-Off</h1>
      <p className="text-muted mb-4">
        8 of 12 third-placed teams qualify for the knockout Round of 32
      </p>

      {showTable && qualificationThreshold && hasRemainingMatches && (
        <QualificationThresholdBox threshold={qualificationThreshold} />
      )}

      {showTable ? (
        <div className="group-card">
          <div className="group-card-header">
            <span>Third-Placed Teams Ranking</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              {groupsWithMatches}/12 groups with results
            </span>
          </div>
          <div className="group-card-body">
            <BestThirdTable
              teams={tableData}
              summaries={summariesData.map(s => ({ teamId: s.teamId, summaryHtml: s.summaryHtml, qualProbability: s.qualProbability }))}
            />
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

      {showTable && (
        <ThirdPlacedMatchesGrid teams={matchesGridData} />
      )}

      {/* Ad banner */}
      <AdBanner slot={AD_SLOT_BEST_THIRD} format="auto" className="mt-4" />
    </main>
  );
}
