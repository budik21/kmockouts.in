/**
 * Probability engine — orchestrates scenario enumeration and best-third calculation
 * to produce final qualification probabilities for every team.
 */

import { getDb } from '../lib/db';
import { ALL_GROUPS } from '../lib/constants';
import { GroupId, Team, Match, TeamRow, MatchRow } from '../lib/types';
import { enumerateGroupScenarios, TeamScenarioSummary } from './scenarios';
import { calculateBestThirdProbabilities, GroupData } from './best-third';

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
    isPlaceholder: row.is_placeholder === 1,
    externalId: row.external_id ?? undefined,
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
    homeRcDirect: row.home_rc_direct,
    awayYc: row.away_yc,
    awayRcDirect: row.away_rc_direct,
    venue: row.venue,
    kickOff: row.kick_off,
    status: row.status as Match['status'],
  };
}

function getGroupTeams(groupId: GroupId): Team[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM team WHERE group_id = ? ORDER BY id').all(groupId) as TeamRow[];
  return rows.map(rowToTeam);
}

function getGroupMatches(groupId: GroupId): { played: Match[]; remaining: Match[] } {
  const db = getDb();
  const allRows = db.prepare('SELECT * FROM match WHERE group_id = ? ORDER BY round, kick_off').all(groupId) as MatchRow[];
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
export function calculateGroupProbabilities(groupId: GroupId): TeamScenarioSummary[] {
  const teams = getGroupTeams(groupId);
  const { played, remaining } = getGroupMatches(groupId);
  return enumerateGroupScenarios(teams, played, remaining);
}

/**
 * Calculate probabilities for ALL groups and include best-third qualification.
 */
export function calculateAllProbabilities(): Map<GroupId, TeamScenarioSummary[]> {
  const allGroupData: GroupData[] = [];
  const allResults = new Map<GroupId, TeamScenarioSummary[]>();

  // Step 1: Calculate within-group probabilities
  for (const groupId of ALL_GROUPS) {
    const teams = getGroupTeams(groupId);
    const { played, remaining } = getGroupMatches(groupId);

    allGroupData.push({ groupId, teams, playedMatches: played, remainingMatches: remaining });

    const summaries = enumerateGroupScenarios(teams, played, remaining);
    allResults.set(groupId, summaries);
  }

  // Step 2: Calculate best-third probabilities via Monte Carlo
  const bestThird = calculateBestThirdProbabilities(allGroupData);

  // Step 3: Merge best-third probability into team summaries
  // For each group, the third-placed team's "qualify as third" probability
  // is the Monte Carlo result for that group
  for (const groupId of ALL_GROUPS) {
    const summaries = allResults.get(groupId)!;
    const thirdQualProb = bestThird.groupProbabilities.get(groupId) ?? 0;

    for (const summary of summaries) {
      // prob_third_qualified = prob_third * (chance group's third qualifies)
      // This is an approximation — true probability would require
      // joint simulation, but this gives a good estimate
      (summary as TeamScenarioSummary & { probThirdQualified?: number }).probThirdQualified =
        Math.round(summary.positionProbabilities[3] * thirdQualProb) / 100;
    }
  }

  return allResults;
}

/**
 * Save calculated probabilities to the cache table.
 */
export function cacheProbabilities(
  groupId: GroupId,
  summaries: TeamScenarioSummary[]
): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO probability_cache (group_id, team_id, prob_first, prob_second, prob_third, prob_third_qual, prob_out, scenarios_json, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(group_id, team_id) DO UPDATE SET
      prob_first = excluded.prob_first,
      prob_second = excluded.prob_second,
      prob_third = excluded.prob_third,
      prob_third_qual = excluded.prob_third_qual,
      prob_out = excluded.prob_out,
      scenarios_json = excluded.scenarios_json,
      calculated_at = excluded.calculated_at
  `);

  const insertAll = db.transaction(() => {
    for (const s of summaries) {
      const summary = s as TeamScenarioSummary & { probThirdQualified?: number };
      upsert.run(
        groupId,
        s.teamId,
        s.positionProbabilities[1] ?? 0,
        s.positionProbabilities[2] ?? 0,
        s.positionProbabilities[3] ?? 0,
        summary.probThirdQualified ?? 0,
        s.positionProbabilities[4] ?? 0,
        JSON.stringify(s.edgeScenariosByPosition)
      );
    }
  });

  insertAll();
}
