/**
 * Probability cache: read/write cached probabilities from PostgreSQL.
 * Probabilities are pre-calculated and stored so homepage/group pages
 * don't need to run expensive scenario enumeration at render time.
 */

import { query } from './db';
import { GroupId } from './types';
import { ALL_GROUPS } from './constants';
import { calculateGroupProbabilities, cacheProbabilities } from '../engine/probability';

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
 * Called after match results change (scraper, scenario apply, etc.)
 */
export async function recalculateAllProbabilities(): Promise<void> {
  for (const groupId of ALL_GROUPS) {
    const summaries = await calculateGroupProbabilities(groupId as GroupId);
    await cacheProbabilities(groupId as GroupId, summaries);
  }
}

/**
 * Recalculate and cache for a single group.
 */
export async function recalculateGroupProbabilities(groupId: GroupId): Promise<void> {
  const summaries = await calculateGroupProbabilities(groupId);
  await cacheProbabilities(groupId, summaries);
}
