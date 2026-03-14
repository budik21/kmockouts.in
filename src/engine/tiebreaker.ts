/**
 * FIFA World Cup 2026 — Article 13 Tiebreaker Rules
 *
 * When two or more teams are equal on points, the following
 * criteria are applied IN ORDER:
 *
 * 1. Goal difference (overall)
 * 2. Goals scored (overall)
 * 3. Points in head-to-head matches (among tied teams)
 * 4. Goal difference in head-to-head matches
 * 5. Goals scored in head-to-head matches
 * 6. Fair play points (YC=-1, direct RC=-4, combined=-5)
 * 7. Drawing of lots (not implemented — we treat as equal)
 *
 * KEY DIFFERENCE from UCL: FIFA uses overall GD first, then H2H.
 * UCL uses H2H first, then overall GD.
 */

import { Match, TeamStanding } from '../lib/types';
import { getHeadToHeadMatches } from './standings';
import { calculateFairPlayPoints } from './fair-play';

/**
 * Sort standings by FIFA WC2026 tiebreaker rules.
 * Returns a new sorted array (does not mutate input).
 */
export function sortByTiebreaker(
  standings: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  // First, sort by points descending
  const sorted = [...standings].sort((a, b) => b.points - a.points);

  // Group teams with equal points and resolve ties
  const result: TeamStanding[] = [];
  let i = 0;

  while (i < sorted.length) {
    // Find all teams with the same points
    const group: TeamStanding[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && sorted[j].points === sorted[i].points) {
      group.push(sorted[j]);
      j++;
    }

    if (group.length === 1) {
      result.push(group[0]);
    } else {
      // Resolve tie among group
      const resolved = resolveTie(group, allMatches);
      result.push(...resolved);
    }

    i = j;
  }

  return result;
}

/**
 * Resolve a tie among teams with equal points using FIFA criteria 1-7.
 */
function resolveTie(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  // Criterion 1: Goal difference (overall)
  const byGD = stableSortDesc(tiedTeams, (s) => s.goalDifference);
  const gdGroups = groupByValue(byGD, (s) => s.goalDifference);
  if (gdGroups.length > 1) {
    return gdGroups.flatMap((g) =>
      g.length === 1 ? g : resolveTieFromCriterion2(g, allMatches)
    );
  }

  return resolveTieFromCriterion2(tiedTeams, allMatches);
}

function resolveTieFromCriterion2(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  // Criterion 2: Goals scored (overall)
  const byGF = stableSortDesc(tiedTeams, (s) => s.goalsFor);
  const gfGroups = groupByValue(byGF, (s) => s.goalsFor);
  if (gfGroups.length > 1) {
    return gfGroups.flatMap((g) =>
      g.length === 1 ? g : resolveTieFromCriterion3(g, allMatches)
    );
  }

  return resolveTieFromCriterion3(tiedTeams, allMatches);
}

function resolveTieFromCriterion3(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  // Criteria 3-5: Head-to-head among tied teams
  const teamIds = new Set(tiedTeams.map((s) => s.team.id));
  const h2hMatches = getHeadToHeadMatches(teamIds, allMatches);

  // Calculate H2H mini-table
  const h2h = calculateH2HStats(tiedTeams, h2hMatches);

  // Criterion 3: H2H points
  const byH2HPts = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.points);
  const h2hPtsGroups = groupByValue(byH2HPts, (s) => h2h.get(s.team.id)!.points);
  if (h2hPtsGroups.length > 1) {
    return h2hPtsGroups.flatMap((g) =>
      g.length === 1 ? g : resolveTieFromCriterion4(g, allMatches, h2h)
    );
  }

  return resolveTieFromCriterion4(tiedTeams, allMatches, h2h);
}

function resolveTieFromCriterion4(
  tiedTeams: TeamStanding[],
  allMatches: Match[],
  h2h: Map<number, H2HStats>
): TeamStanding[] {
  // Criterion 4: H2H goal difference
  const byH2HGD = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.goalDifference);
  const h2hGDGroups = groupByValue(byH2HGD, (s) => h2h.get(s.team.id)!.goalDifference);
  if (h2hGDGroups.length > 1) {
    return h2hGDGroups.flatMap((g) =>
      g.length === 1 ? g : resolveTieFromCriterion5(g, allMatches, h2h)
    );
  }

  return resolveTieFromCriterion5(tiedTeams, allMatches, h2h);
}

function resolveTieFromCriterion5(
  tiedTeams: TeamStanding[],
  _allMatches: Match[],
  h2h: Map<number, H2HStats>
): TeamStanding[] {
  // Criterion 5: H2H goals scored
  const byH2HGF = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.goalsFor);
  const h2hGFGroups = groupByValue(byH2HGF, (s) => h2h.get(s.team.id)!.goalsFor);
  if (h2hGFGroups.length > 1) {
    return h2hGFGroups.flatMap((g) =>
      g.length === 1 ? g : resolveTieFromCriterion6(g)
    );
  }

  return resolveTieFromCriterion6(tiedTeams);
}

function resolveTieFromCriterion6(
  tiedTeams: TeamStanding[]
): TeamStanding[] {
  // Criterion 6: Fair play points (higher = better, all are negative or 0)
  const byFP = stableSortDesc(tiedTeams, (s) => s.fairPlayPoints);
  const fpGroups = groupByValue(byFP, (s) => s.fairPlayPoints);
  if (fpGroups.length > 1) {
    return fpGroups.flatMap((g) =>
      g.length === 1 ? g : g // Criterion 7: drawing of lots — keep as-is
    );
  }

  // Criterion 7: Drawing of lots — cannot resolve programmatically
  return tiedTeams;
}

// ============================================================
// Head-to-head calculation
// ============================================================

interface H2HStats {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

function calculateH2HStats(
  teams: TeamStanding[],
  h2hMatches: Match[]
): Map<number, H2HStats> {
  const stats = new Map<number, H2HStats>();

  for (const t of teams) {
    stats.set(t.team.id, {
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
    });
  }

  for (const m of h2hMatches) {
    if (m.homeGoals === null || m.awayGoals === null) continue;

    const home = stats.get(m.homeTeamId);
    const away = stats.get(m.awayTeamId);
    if (!home || !away) continue;

    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;

    if (m.homeGoals > m.awayGoals) {
      home.points += 3;
    } else if (m.homeGoals < m.awayGoals) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  for (const s of stats.values()) {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
  }

  return stats;
}

// ============================================================
// Utility functions
// ============================================================

/**
 * Stable sort descending by a numeric value.
 */
function stableSortDesc<T>(arr: T[], getValue: (item: T) => number): T[] {
  return [...arr].sort((a, b) => getValue(b) - getValue(a));
}

/**
 * Group consecutive items with the same value.
 */
function groupByValue<T>(arr: T[], getValue: (item: T) => number): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let currentVal: number | null = null;

  for (const item of arr) {
    const val = getValue(item);
    if (currentVal === null || val === currentVal) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
    }
    currentVal = val;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}
