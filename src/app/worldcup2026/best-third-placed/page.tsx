import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match, TeamStanding } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { compareThirdPlaced } from '@/engine/best-third';
import { getCachedBestThirdProbabilities, getCachedQualificationThreshold } from '@/engine/probability';
import BestThirdTable from '@/app/components/BestThirdTable';
import BestThirdSummaries from '@/app/components/BestThirdSummaries';
import ThirdPlacedMatchesGrid from '@/app/components/ThirdPlacedMatchesGrid';
import { generateBestThirdSummaries, BestThirdTeamContext } from '@/engine/best-third-summary-ai';
import QualificationThresholdBox from '@/app/components/QualificationThreshold';
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
    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const finishedRows = await query<MatchRow>(
      "SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round",
      [gid],
    );
    const allMatchRows = await query<MatchRow>(
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
  if (allTeamsPlayedTwo) {
    try {
      [bestThirdProbs, qualificationThreshold] = await Promise.all([
        getCachedBestThirdProbabilities(),
        getCachedQualificationThreshold(),
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
        qualProbability: bestThirdProbs.get(tp.groupId) ?? 0,
        remainingMatch: remaining ? { opponent: remaining.opponentName } : null,
      };
    });

    try {
      const aiSummaries = await generateBestThirdSummaries(aiTeams);
      summariesData = thirdPlaced
        .map((tp, i) => {
          const html = aiSummaries.get(tp.standing.team.id);
          if (!html) return null;
          return {
            teamId: tp.standing.team.id,
            teamName: tp.standing.team.name,
            teamShort: tp.standing.team.shortName,
            countryCode: tp.standing.team.countryCode,
            groupId: tp.groupId,
            qualProbability: bestThirdProbs!.get(tp.groupId) ?? 0,
            summaryHtml: html,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    } catch (err) {
      console.error('Best-third AI summaries failed:', err);
    }
  }

  return (
    <main className="container py-4">
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

      <h1 className="mb-1">Best Third-Placed Teams</h1>
      <p className="text-muted mb-4">
        8 of 12 third-placed teams qualify for the Round of 32
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
              groupProbabilities={bestThirdProbs ? Object.fromEntries(bestThirdProbs) : undefined}
              qualificationThreshold={hasRemainingMatches ? qualificationThreshold : undefined}
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

      {summariesData.length > 0 && (
        <BestThirdSummaries teams={summariesData} />
      )}

      {showTable && (
        <ThirdPlacedMatchesGrid teams={matchesGridData} />
      )}
    </main>
  );
}
