/**
 * Probability cache: read/write cached probabilities from PostgreSQL.
 * Probabilities are pre-calculated and stored so homepage/group pages
 * don't need to run expensive scenario enumeration at render time.
 */

import { query } from './db';
import { GroupId } from './types';
import { ALL_GROUPS } from './constants';
import { calculateGroupProbabilities, calculateAllProbabilities, cacheProbabilities, cacheBestThirdProbabilities, cacheQualificationThreshold } from '../engine/probability';

export interface CachedTeamProb {
  teamId: number;
  groupId: string;
  probFirst: number;
  probSecond: number;
  probThird: number;
  probThirdQual: number;
  probOut: number;
  calculatedAt: string;
}

interface CacheRow {
  group_id: string;
  team_id: number;
  prob_first: number;
  prob_second: number;
  prob_third: number;
  prob_third_qual: number;
  prob_out: number;
  calculated_at: string;
}

function rowToProb(r: CacheRow): CachedTeamProb {
  return {
    teamId: r.team_id,
    groupId: r.group_id,
    probFirst: r.prob_first,
    probSecond: r.prob_second,
    probThird: r.prob_third,
    probThirdQual: r.prob_third_qual,
    probOut: r.prob_out,
    calculatedAt: r.calculated_at,
  };
}

/**
 * Get cached probabilities for a single group.
 * Returns a Map<teamId, CachedTeamProb> or null if no cache exists.
 */
export async function getCachedGroupProbs(groupId: GroupId): Promise<Map<number, CachedTeamProb> | null> {
  const rows = await query<CacheRow>(
    'SELECT * FROM probability_cache WHERE group_id = $1',
    [groupId]
  );

  if (rows.length === 0) return null;

  const map = new Map<number, CachedTeamProb>();
  for (const r of rows) {
    map.set(r.team_id, rowToProb(r));
  }
  return map;
}

/**
 * Get cached probabilities for ALL groups.
 * Returns Map<groupId, Map<teamId, CachedTeamProb>>.
 */
export async function getAllCachedProbs(): Promise<Map<string, Map<number, CachedTeamProb>>> {
  const rows = await query<CacheRow>('SELECT * FROM probability_cache');

  const result = new Map<string, Map<number, CachedTeamProb>>();

  for (const r of rows) {
    if (!result.has(r.group_id)) {
      result.set(r.group_id, new Map());
    }
    result.get(r.group_id)!.set(r.team_id, rowToProb(r));
  }
  return result;
}

/**
 * Get cached probabilities for ALL groups, computing any missing ones on-the-fly.
 * This ensures probabilities always display, even before the first explicit recalculation.
 */
export async function getAllCachedProbsOrCompute(): Promise<Map<string, Map<number, CachedTeamProb>>> {
  const cached = await getAllCachedProbs();

  // If we have all 12 groups cached, return directly
  if (cached.size >= ALL_GROUPS.length) return cached;

  // Compute missing groups
  for (const gid of ALL_GROUPS) {
    if (!cached.has(gid)) {
      const summaries = await calculateGroupProbabilities(gid as GroupId);
      await cacheProbabilities(gid as GroupId, summaries);
    }
  }

  // Re-read full cache
  return getAllCachedProbs();
}

/**
 * Recalculate and cache probabilities for all groups.
 * Uses full cross-group calculation (includes best-third Monte Carlo).
 * Called after match results change (scraper, scenario apply, etc.)
 */
export async function recalculateAllProbabilities(): Promise<void> {
  const { results, bestThird } = await calculateAllProbabilities();

  for (const groupId of ALL_GROUPS) {
    const summaries = results.get(groupId)!;
    await cacheProbabilities(groupId as GroupId, summaries);
  }

  // Cache per-group best-third probabilities for the best-third page
  await cacheBestThirdProbabilities(bestThird.groupProbabilities);

  // Cache qualification threshold (what stats are needed for 8th place)
  if (bestThird.qualificationThreshold) {
    await cacheQualificationThreshold(bestThird.qualificationThreshold);
  }
}

/**
 * Recalculate and cache for a single group.
 */
export async function recalculateGroupProbabilities(groupId: GroupId): Promise<void> {
  const summaries = await calculateGroupProbabilities(groupId);
  await cacheProbabilities(groupId, summaries);
}

/**
 * Pre-generate AI summaries for all best-third teams.
 * Called after probability recalculation so summaries are ready
 * when users visit the page (instead of generating on first load).
 */
export async function pregenerateBestThirdSummaries(): Promise<void> {
  // Lazy imports to avoid circular dependencies
  const { calculateStandings } = await import('../engine/standings');
  const { compareThirdPlaced } = await import('../engine/best-third');
  const { generateBestThirdSummaries } = await import('../engine/best-third-summary-ai');
  type BestThirdTeamContext = import('../engine/best-third-summary-ai').BestThirdTeamContext;
  const { getCachedQualificationThreshold } = await import('../engine/probability');

  // Check preconditions: all 12 groups must have results, all teams ≥2 matches
  let allTeamsPlayedTwo = true;
  let hasRemainingMatches = false;
  let groupsWithMatches = 0;

  interface ThirdEntry { groupId: string; teamId: number; teamName: string; points: number; goalDifference: number; goalsFor: number; standing: ReturnType<typeof calculateStandings>[number]; remainingOpponent: string | null; }
  const thirdPlaced: ThirdEntry[] = [];

  for (const gid of ALL_GROUPS) {
    const teamRows = await query<{ id: number; name: string; short_name: string; country_code: string; group_id: string; is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null }>(
      'SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]
    );
    const finishedRows = await query<{ id: number; group_id: string; round: number; home_team_id: number; away_team_id: number; home_goals: number | null; away_goals: number | null; status: string }>(
      "SELECT id, group_id, round, home_team_id, away_team_id, home_goals, away_goals, status FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round", [gid]
    );
    const allMatchRows = await query<{ id: number; status: string; home_team_id: number; away_team_id: number }>(
      'SELECT id, status, home_team_id, away_team_id FROM match WHERE group_id = $1', [gid]
    );

    if (finishedRows.length > 0) groupsWithMatches++;
    if (allMatchRows.length > finishedRows.length) hasRemainingMatches = true;

    const teams = teamRows.map(r => ({
      id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
      groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
      externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
    }));
    const matches = finishedRows.map(r => ({
      id: r.id, groupId: r.group_id as GroupId, round: r.round,
      homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
      homeGoals: r.home_goals, awayGoals: r.away_goals,
      homeYc: 0, homeYc2: 0, homeRcDirect: 0, homeYcRc: 0,
      awayYc: 0, awayYc2: 0, awayRcDirect: 0, awayYcRc: 0,
      venue: '', kickOff: '', status: r.status as 'FINISHED',
    }));

    if (allTeamsPlayedTwo) {
      for (const t of teams) {
        const cnt = matches.filter(m => m.homeTeamId === t.id || m.awayTeamId === t.id).length;
        if (cnt < 2) { allTeamsPlayedTwo = false; break; }
      }
    }

    const standings = calculateStandings({ teams, matches });
    const third = standings.find(s => s.position === 3);
    if (third) {
      // Find remaining match opponent
      const remaining = allMatchRows.find(m => m.status !== 'FINISHED' && (m.home_team_id === third.team.id || m.away_team_id === third.team.id));
      let remainingOpponent: string | null = null;
      if (remaining) {
        const oppId = remaining.home_team_id === third.team.id ? remaining.away_team_id : remaining.home_team_id;
        const opp = teams.find(t => t.id === oppId);
        remainingOpponent = opp?.name ?? null;
      }
      thirdPlaced.push({
        groupId: gid, teamId: third.team.id, teamName: third.team.name,
        points: third.points, goalDifference: third.goalDifference, goalsFor: third.goalsFor,
        standing: third, remainingOpponent,
      });
    }
  }

  if (groupsWithMatches < 12 || !allTeamsPlayedTwo || !hasRemainingMatches) {
    console.log('[pregenerate] Skipping AI summaries — preconditions not met');
    return;
  }

  // Sort by FIFA criteria
  thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

  // Load per-team probabilities and threshold
  const [allTeamProbs, qualificationThreshold] = await Promise.all([
    getAllCachedProbs(),
    getCachedQualificationThreshold(),
  ]);

  const aiTeams: BestThirdTeamContext[] = thirdPlaced.map((tp, i) => {
    const groupCache = allTeamProbs.get(tp.groupId);
    let qualProb = 0;
    if (groupCache) {
      const teamProb = groupCache.get(tp.teamId);
      if (teamProb && teamProb.probThirdQual > 0) qualProb = teamProb.probThirdQual;
    }
    return {
      teamName: tp.teamName,
      teamId: tp.teamId,
      groupId: tp.groupId,
      currentRank: i + 1,
      points: tp.points,
      goalDifference: tp.goalDifference,
      goalsFor: tp.goalsFor,
      qualProbability: qualProb,
      remainingMatch: tp.remainingOpponent ? { opponent: tp.remainingOpponent } : null,
    };
  });

  console.log(`[pregenerate] Generating AI summaries for ${aiTeams.length} best-third teams...`);
  await generateBestThirdSummaries(aiTeams, qualificationThreshold);
  console.log('[pregenerate] AI summaries done');
}
