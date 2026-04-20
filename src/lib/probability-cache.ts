/**
 * Probability cache: read/write cached probabilities from PostgreSQL.
 * Probabilities are pre-calculated and stored so homepage/group pages
 * don't need to run expensive scenario enumeration at render time.
 */

import { query, getPool } from './db';
import { GroupId } from './types';
import { ALL_GROUPS } from './constants';
import { calculateGroupProbabilities, calculateAllProbabilities, calculateAffectedProbabilities, cacheProbabilities, cacheBestThirdProbabilities, cacheQualificationThreshold } from '../engine/probability';

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
 * Update only the prob_third_qual column for teams in groups other than `changedGroupId`,
 * using freshly-computed per-team best-third probabilities. Used as a cheap follow-up
 * after a single-group scenario recalc — the other groups' within-group probabilities
 * don't change, but cross-group best-third qualification probability does.
 */
async function updateProbThirdQualForUnchangedGroups(
  changedGroupId: GroupId,
  teamProbabilities: Map<number, number>,
): Promise<void> {
  if (teamProbabilities.size === 0) return;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [teamId, prob] of teamProbabilities) {
      await client.query(
        `UPDATE probability_cache
         SET prob_third_qual = $1, calculated_at = TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         WHERE team_id = $2 AND group_id <> $3`,
        [prob, teamId, changedGroupId],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Recalculate probabilities after a single match result change:
 *  - Re-enumerate scenarios for the affected group only (writes full cache for it).
 *  - Run cross-group best-third Monte Carlo with fresh data from all groups.
 *  - Patch prob_third_qual for the other 11 groups (their within-group probs are unchanged).
 *  - Refresh best-third cache and qualification threshold.
 * Much cheaper than recalculateAllProbabilities when only one group is affected.
 */
export async function recalculateAffectedProbabilities(changedGroupId: GroupId): Promise<void> {
  const { changedGroupSummaries, bestThird } = await calculateAffectedProbabilities(changedGroupId);

  await cacheProbabilities(changedGroupId, changedGroupSummaries);
  await updateProbThirdQualForUnchangedGroups(changedGroupId, bestThird.teamProbabilities);
  await cacheBestThirdProbabilities(bestThird.groupProbabilities);
  if (bestThird.qualificationThreshold) {
    await cacheQualificationThreshold(bestThird.qualificationThreshold);
  }
}

/**
 * Pre-generate AI scenario summaries for every team in a group at every
 * position their position probability is > 0 and < 100. Populates the
 * `ai_summary_cache` table so subsequent team-detail page renders hit the
 * cache instead of triggering a fresh Claude API call (which can take 15s
 * and, on timeout, would leave nothing cached — causing every visitor to
 * pay the latency). Called from the admin match-update endpoint after
 * probability recalc completes.
 */
export async function pregenerateTeamScenarioSummaries(groupId: GroupId): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  const { isFeatureEnabled } = await import('./feature-flags');
  if (!(await isFeatureEnabled('ai_predictions', true))) {
    console.log(`[pregenerate] Skipping scenario AI (ai_predictions flag off) for group ${groupId}`);
    return;
  }

  // Lazy imports to avoid circular dependencies and to keep this helper
  // out of the hot render path when it's not used.
  const { calculateStandings } = await import('../engine/standings');
  const { enumerateGroupScenarios } = await import('../engine/scenarios');
  const { generateAiScenarioSummaries } = await import('../engine/scenario-summary-ai');

  const teamRows = await query<{
    id: number; name: string; short_name: string; country_code: string; group_id: string;
    is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null;
  }>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);

  const matchRows = await query<{
    id: number; group_id: string; round: number;
    home_team_id: number; away_team_id: number;
    home_goals: number | null; away_goals: number | null;
    home_yc: number; home_yc2: number; home_rc_direct: number; home_yc_rc: number;
    away_yc: number; away_yc2: number; away_rc_direct: number; away_yc_rc: number;
    venue: string; kick_off: string; status: string;
  }>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

  const teams = teamRows.map(r => ({
    id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
    groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
    externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
  }));
  const allMatches = matchRows.map(r => ({
    id: r.id, groupId: r.group_id as GroupId, round: r.round,
    homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
    homeGoals: r.home_goals, awayGoals: r.away_goals,
    homeYc: r.home_yc, homeYc2: r.home_yc2, homeRcDirect: r.home_rc_direct, homeYcRc: r.home_yc_rc,
    awayYc: r.away_yc, awayYc2: r.away_yc2, awayRcDirect: r.away_rc_direct, awayYcRc: r.away_yc_rc,
    venue: r.venue, kickOff: r.kick_off, status: r.status as 'FINISHED' | 'LIVE' | 'SCHEDULED',
  }));

  const played = allMatches.filter(m => m.status === 'FINISHED');
  const remaining = allMatches.filter(m => m.status !== 'FINISHED');

  // AI summaries are only rendered once every team has played at least once.
  const allTeamsPlayed = teams.every(t => played.some(m => m.homeTeamId === t.id || m.awayTeamId === t.id));
  if (remaining.length === 0 || !allTeamsPlayed) {
    return;
  }

  const standings = calculateStandings({ teams, matches: played });
  const currentStandings = standings.map(s => ({
    teamName: s.team.name,
    points: s.points,
    gd: s.goalsFor - s.goalsAgainst,
    position: s.position,
  }));

  const summaries = enumerateGroupScenarios(teams, played, remaining);
  const remainingMatchesInfo = remaining.map((m, i) => ({
    matchIndex: i,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
    awayTeamName: teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
  }));

  console.log(`[pregenerate] Generating scenario AI summaries for group ${groupId} (${teams.length} teams)`);

  // Fire all teams in parallel. Each call internally fans out across
  // positions (also in parallel), but every actual Claude API request is
  // gated by the process-wide semaphore in lib/claude-concurrency.ts, so
  // the real concurrency stays bounded regardless of how many teams or
  // groups are in flight at once.
  await Promise.allSettled(
    teams.map(team => {
      const teamSummary = summaries.find(s => s.teamId === team.id);
      if (!teamSummary) return Promise.resolve();
      return generateAiScenarioSummaries({
        teamId: team.id,
        teamName: team.name,
        groupId: groupId,
        outcomePatternsByPosition: teamSummary.outcomePatternsByPosition,
        probabilities: teamSummary.positionProbabilities,
        remainingMatches: remainingMatchesInfo,
        currentStandings,
      }).catch(err => {
        console.error(`[pregenerate] Team scenario AI failed for ${team.name}:`, err);
      });
    }),
  );

  console.log(`[pregenerate] Team scenario AI summaries done for group ${groupId}`);
}

/**
 * Pre-generate AI summaries for all best-third teams.
 * Called after probability recalculation so summaries are ready
 * when users visit the page (instead of generating on first load).
 */
export async function pregenerateBestThirdSummaries(): Promise<void> {
  const { isFeatureEnabled } = await import('./feature-flags');
  if (!(await isFeatureEnabled('ai_predictions', true))) {
    console.log('[pregenerate] Skipping best-third AI (ai_predictions flag off)');
    return;
  }

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
