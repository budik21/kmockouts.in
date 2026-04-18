/**
 * Probability engine — orchestrates scenario enumeration and best-third calculation
 * to produce final qualification probabilities for every team.
 */

import { query, getPool } from '../lib/db';
import { ALL_GROUPS } from '../lib/constants';
import { GroupId, Team, Match, TeamRow, MatchRow } from '../lib/types';
import { enumerateGroupScenarios, TeamScenarioSummary } from './scenarios';
import { calculateBestThirdProbabilities, GroupData, BestThirdResult, QualificationThreshold } from './best-third';

// ============================================================
// Data access helpers
// ============================================================

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    countryCode: row.country_code,
    groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder,
    externalId: row.external_id ?? undefined,
    fifaRanking: row.fifa_ranking ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    groupId: row.group_id as GroupId,
    round: row.round,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    homeYc: row.home_yc,
    homeYc2: row.home_yc2,
    homeRcDirect: row.home_rc_direct,
    homeYcRc: row.home_yc_rc,
    awayYc: row.away_yc,
    awayYc2: row.away_yc2,
    awayRcDirect: row.away_rc_direct,
    awayYcRc: row.away_yc_rc,
    venue: row.venue,
    kickOff: row.kick_off,
    status: row.status as Match['status'],
  };
}

async function getGroupTeams(groupId: GroupId): Promise<Team[]> {
  const rows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
  return rows.map(rowToTeam);
}

async function getGroupMatches(groupId: GroupId): Promise<{ played: Match[]; remaining: Match[] }> {
  const allRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);
  const all = allRows.map(rowToMatch);
  return {
    played: all.filter((m) => m.status === 'FINISHED'),
    remaining: all.filter((m) => m.status !== 'FINISHED'),
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Calculate scenario summaries for a single group.
 */
export async function calculateGroupProbabilities(groupId: GroupId): Promise<TeamScenarioSummary[]> {
  const teams = await getGroupTeams(groupId);
  const { played, remaining } = await getGroupMatches(groupId);
  return enumerateGroupScenarios(teams, played, remaining);
}

/**
 * Calculate probabilities for ALL groups and include best-third qualification.
 */
export async function calculateAllProbabilities(): Promise<{ results: Map<GroupId, TeamScenarioSummary[]>; bestThird: BestThirdResult }> {
  const allGroupData: GroupData[] = [];
  const allResults = new Map<GroupId, TeamScenarioSummary[]>();

  // Step 1: Calculate within-group probabilities
  for (const groupId of ALL_GROUPS) {
    const teams = await getGroupTeams(groupId);
    const { played, remaining } = await getGroupMatches(groupId);

    allGroupData.push({ groupId, teams, playedMatches: played, remainingMatches: remaining });

    const summaries = enumerateGroupScenarios(teams, played, remaining);
    allResults.set(groupId, summaries);
  }

  // Step 2: Calculate best-third probabilities via Monte Carlo
  const bestThird = calculateBestThirdProbabilities(allGroupData);

  // Step 3: Merge best-third probability into team summaries
  // Use per-team probability (more accurate than group-level × position probability)
  for (const groupId of ALL_GROUPS) {
    const summaries = allResults.get(groupId)!;

    for (const summary of summaries) {
      const teamProb = bestThird.teamProbabilities.get(summary.teamId) ?? 0;
      (summary as TeamScenarioSummary & { probThirdQualified?: number }).probThirdQualified = teamProb;
    }
  }

  return { results: allResults, bestThird };
}

/**
 * Calculate scenario summaries only for a single changed group, but still run the
 * cross-group best-third Monte Carlo using fresh data from all 12 groups. Used after
 * a single match result edit where only one group's within-group probabilities can
 * change; best-third `probThirdQualified` may shift across all groups.
 */
export async function calculateAffectedProbabilities(
  changedGroupId: GroupId,
): Promise<{ changedGroupSummaries: TeamScenarioSummary[]; bestThird: BestThirdResult }> {
  const allGroupData: GroupData[] = [];
  for (const gid of ALL_GROUPS) {
    const teams = await getGroupTeams(gid);
    const { played, remaining } = await getGroupMatches(gid);
    allGroupData.push({
      groupId: gid,
      teams,
      playedMatches: played,
      remainingMatches: remaining,
    });
  }

  const changed = allGroupData.find((g) => g.groupId === changedGroupId);
  if (!changed) {
    throw new Error(`Unknown group ${changedGroupId}`);
  }

  const summaries = enumerateGroupScenarios(
    changed.teams,
    changed.playedMatches,
    changed.remainingMatches,
  );

  const bestThird = calculateBestThirdProbabilities(allGroupData);

  for (const s of summaries) {
    const teamProb = bestThird.teamProbabilities.get(s.teamId) ?? 0;
    (s as TeamScenarioSummary & { probThirdQualified?: number }).probThirdQualified = teamProb;
  }

  return { changedGroupSummaries: summaries, bestThird };
}

/**
 * Save per-group best-third qualification probabilities.
 */
export async function cacheBestThirdProbabilities(
  groupProbabilities: Map<GroupId, number>
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [groupId, prob] of groupProbabilities) {
      await client.query(
        `INSERT INTO best_third_cache (group_id, qual_probability, calculated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT(group_id) DO UPDATE SET
           qual_probability = EXCLUDED.qual_probability,
           calculated_at = EXCLUDED.calculated_at`,
        [groupId, prob],
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
 * Read cached best-third probabilities for all groups.
 */
export async function getCachedBestThirdProbabilities(): Promise<Map<GroupId, number> | null> {
  const rows = await query<{ group_id: string; qual_probability: number }>(
    'SELECT group_id, qual_probability FROM best_third_cache',
  );
  if (rows.length === 0) return null;
  const map = new Map<GroupId, number>();
  for (const r of rows) {
    map.set(r.group_id as GroupId, r.qual_probability);
  }
  return map;
}

/**
 * Save calculated probabilities to the cache table.
 */
export async function cacheProbabilities(
  groupId: GroupId,
  summaries: TeamScenarioSummary[]
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const s of summaries) {
      const summary = s as TeamScenarioSummary & { probThirdQualified?: number };
      await client.query(
        `INSERT INTO probability_cache (group_id, team_id, prob_first, prob_second, prob_third, prob_third_qual, prob_out, scenarios_json, calculated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT(group_id, team_id) DO UPDATE SET
           prob_first = EXCLUDED.prob_first,
           prob_second = EXCLUDED.prob_second,
           prob_third = EXCLUDED.prob_third,
           prob_third_qual = EXCLUDED.prob_third_qual,
           prob_out = EXCLUDED.prob_out,
           scenarios_json = EXCLUDED.scenarios_json,
           calculated_at = EXCLUDED.calculated_at`,
        [
          groupId,
          s.teamId,
          s.positionProbabilities[1] ?? 0,
          s.positionProbabilities[2] ?? 0,
          s.positionProbabilities[3] ?? 0,
          summary.probThirdQualified ?? 0,
          s.positionProbabilities[4] ?? 0,
          JSON.stringify(s.edgeScenariosByPosition),
        ]
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
 * Save qualification threshold data to cache.
 */
export async function cacheQualificationThreshold(
  threshold: QualificationThreshold,
): Promise<void> {
  await query(
    `INSERT INTO qualification_threshold_cache (id, threshold_json, calculated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT(id) DO UPDATE SET
       threshold_json = EXCLUDED.threshold_json,
       calculated_at = EXCLUDED.calculated_at`,
    [JSON.stringify(threshold)],
  );
}

/**
 * Read cached qualification threshold.
 */
export async function getCachedQualificationThreshold(): Promise<QualificationThreshold | null> {
  const rows = await query<{ threshold_json: string }>(
    'SELECT threshold_json FROM qualification_threshold_cache WHERE id = 1',
  );
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].threshold_json) as QualificationThreshold;
  } catch {
    return null;
  }
}
