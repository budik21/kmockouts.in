/**
 * Probability cache: read/write cached probabilities from SQLite.
 * Probabilities are pre-calculated and stored so homepage/group pages
 * don't need to run expensive scenario enumeration at render time.
 */

import { getDb } from './db';
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

/**
 * Get cached probabilities for a single group.
 * Returns a Map<teamId, CachedTeamProb> or null if no cache exists.
 */
export function getCachedGroupProbs(groupId: GroupId): Map<number, CachedTeamProb> | null {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM probability_cache WHERE group_id = ?'
  ).all(groupId) as CacheRow[];

  if (rows.length === 0) return null;

  const map = new Map<number, CachedTeamProb>();
  for (const r of rows) {
    map.set(r.team_id, {
      teamId: r.team_id,
      groupId: r.group_id,
      probFirst: r.prob_first,
      probSecond: r.prob_second,
      probThird: r.prob_third,
      probThirdQual: r.prob_third_qual,
      probOut: r.prob_out,
      calculatedAt: r.calculated_at,
    });
  }
  return map;
}

/**
 * Get cached probabilities for ALL groups.
 * Returns Map<groupId, Map<teamId, CachedTeamProb>>.
 */
export function getAllCachedProbs(): Map<string, Map<number, CachedTeamProb>> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM probability_cache').all() as CacheRow[];

  const result = new Map<string, Map<number, CachedTeamProb>>();

  for (const r of rows) {
    if (!result.has(r.group_id)) {
      result.set(r.group_id, new Map());
    }
    result.get(r.group_id)!.set(r.team_id, {
      teamId: r.team_id,
      groupId: r.group_id,
      probFirst: r.prob_first,
      probSecond: r.prob_second,
      probThird: r.prob_third,
      probThirdQual: r.prob_third_qual,
      probOut: r.prob_out,
      calculatedAt: r.calculated_at,
    });
  }
  return result;
}

/**
 * Get cached probabilities for ALL groups, computing any missing ones on-the-fly.
 * This ensures probabilities always display, even before the first explicit recalculation.
 */
export function getAllCachedProbsOrCompute(): Map<string, Map<number, CachedTeamProb>> {
  const cached = getAllCachedProbs();

  // If we have all 12 groups cached, return directly
  if (cached.size >= ALL_GROUPS.length) return cached;

  // Compute missing groups
  for (const gid of ALL_GROUPS) {
    if (!cached.has(gid)) {
      const summaries = calculateGroupProbabilities(gid as GroupId);
      cacheProbabilities(gid as GroupId, summaries);
    }
  }

  // Re-read full cache
  return getAllCachedProbs();
}

/**
 * Recalculate and cache probabilities for all groups.
 * Called after match results change (scraper, scenario apply, etc.)
 */
export function recalculateAllProbabilities(): void {
  for (const groupId of ALL_GROUPS) {
    const summaries = calculateGroupProbabilities(groupId as GroupId);
    cacheProbabilities(groupId as GroupId, summaries);
  }
}

/**
 * Recalculate and cache for a single group.
 */
export function recalculateGroupProbabilities(groupId: GroupId): void {
  const summaries = calculateGroupProbabilities(groupId);
  cacheProbabilities(groupId, summaries);
}
