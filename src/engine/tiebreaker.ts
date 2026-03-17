/**
 * FIFA World Cup 2026 — Article 13 Tiebreaker Rules
 *
 * When two or more teams in the same group are equal on points,
 * the following criteria are applied IN ORDER:
 *
 * Step 1 (head-to-head among concerned teams):
 *   a) greatest number of points in H2H matches
 *   b) superior goal difference in H2H matches
 *   c) greatest number of goals scored in H2H matches
 *
 * Step 2 (if still tied after Step 1):
 *   Re-apply criteria a)–c) to matches between remaining teams only.
 *   If that doesn't fully resolve, apply:
 *   d) superior goal difference in all group matches
 *   e) greatest number of goals scored in all group matches
 *   f) highest team conduct score (fair play points)
 *
 *   When a criterion from d)–f) separates some but not all teams,
 *   the remaining teams continue from the next criterion (no restart).
 *
 * Step 3:
 *   g) FIFA/Coca-Cola Men's World Ranking (most recent)
 *   h) FIFA/Coca-Cola Men's World Ranking (previous edition)
 *      — not implemented (fallback: treat as equal)
 */

import { Match, TeamStanding } from '../lib/types';
import { getHeadToHeadMatches } from './standings';

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
      // Resolve tie among group using Step 1
      const resolved = resolveStep1(group, allMatches);
      result.push(...resolved);
    }

    i = j;
  }

  return result;
}

// ============================================================
// Step 1: Head-to-head among concerned teams (a, b, c)
// ============================================================

function resolveStep1(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  const teamIds = new Set(tiedTeams.map((s) => s.team.id));
  const h2hMatches = getHeadToHeadMatches(teamIds, allMatches);
  const h2h = calculateH2HStats(tiedTeams, h2hMatches);

  // a) H2H points
  const byH2HPts = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.points);
  const ptsGroups = groupByValue(byH2HPts, (s) => h2h.get(s.team.id)!.points);
  if (ptsGroups.length > 1) {
    return ptsGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep1_b(g, h2h, allMatches)
    );
  }

  return resolveStep1_b(tiedTeams, h2h, allMatches);
}

function resolveStep1_b(
  tiedTeams: TeamStanding[],
  h2h: Map<number, H2HStats>,
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // b) H2H goal difference
  const byH2HGD = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.goalDifference);
  const gdGroups = groupByValue(byH2HGD, (s) => h2h.get(s.team.id)!.goalDifference);
  if (gdGroups.length > 1) {
    return gdGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep1_c(g, h2h, allMatches)
    );
  }

  return resolveStep1_c(tiedTeams, h2h, allMatches);
}

function resolveStep1_c(
  tiedTeams: TeamStanding[],
  h2h: Map<number, H2HStats>,
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // c) H2H goals scored
  const byH2HGF = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.goalsFor);
  const gfGroups = groupByValue(byH2HGF, (s) => h2h.get(s.team.id)!.goalsFor);
  if (gfGroups.length > 1) {
    return gfGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep2(g, allMatches)
    );
  }

  return resolveStep2(tiedTeams, allMatches);
}

// ============================================================
// Step 2: Re-apply H2H to remaining subset, then overall stats
// ============================================================

function resolveStep2(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // Step 2 preamble: re-apply a)–c) to matches between remaining teams only.
  // This is different from Step 1 only when the original tied group was > 2
  // and Step 1 partially resolved it, leaving a subset.
  // We recalculate H2H for the remaining subset.
  const teamIds = new Set(tiedTeams.map((s) => s.team.id));
  const h2hMatches = getHeadToHeadMatches(teamIds, allMatches);
  const h2h = calculateH2HStats(tiedTeams, h2hMatches);

  // a) H2H points (among remaining)
  const byH2HPts = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.points);
  const ptsGroups = groupByValue(byH2HPts, (s) => h2h.get(s.team.id)!.points);
  if (ptsGroups.length > 1) {
    return ptsGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep2_b(g, h2h, allMatches)
    );
  }

  return resolveStep2_b(tiedTeams, h2h, allMatches);
}

function resolveStep2_b(
  tiedTeams: TeamStanding[],
  h2h: Map<number, H2HStats>,
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // b) H2H GD (among remaining)
  const byH2HGD = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.goalDifference);
  const gdGroups = groupByValue(byH2HGD, (s) => h2h.get(s.team.id)!.goalDifference);
  if (gdGroups.length > 1) {
    return gdGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep2_c(g, h2h, allMatches)
    );
  }

  return resolveStep2_c(tiedTeams, h2h, allMatches);
}

function resolveStep2_c(
  tiedTeams: TeamStanding[],
  h2h: Map<number, H2HStats>,
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // c) H2H goals scored (among remaining)
  const byH2HGF = stableSortDesc(tiedTeams, (s) => h2h.get(s.team.id)!.goalsFor);
  const gfGroups = groupByValue(byH2HGF, (s) => h2h.get(s.team.id)!.goalsFor);
  if (gfGroups.length > 1) {
    return gfGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep2_d(g, allMatches)
    );
  }

  return resolveStep2_d(tiedTeams, allMatches);
}

function resolveStep2_d(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // d) Overall goal difference
  const byGD = stableSortDesc(tiedTeams, (s) => s.goalDifference);
  const gdGroups = groupByValue(byGD, (s) => s.goalDifference);
  if (gdGroups.length > 1) {
    return gdGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep2_e(g, allMatches)
    );
  }

  return resolveStep2_e(tiedTeams, allMatches);
}

function resolveStep2_e(
  tiedTeams: TeamStanding[],
  allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // e) Overall goals scored
  const byGF = stableSortDesc(tiedTeams, (s) => s.goalsFor);
  const gfGroups = groupByValue(byGF, (s) => s.goalsFor);
  if (gfGroups.length > 1) {
    return gfGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep2_f(g, allMatches)
    );
  }

  return resolveStep2_f(tiedTeams, allMatches);
}

function resolveStep2_f(
  tiedTeams: TeamStanding[],
  _allMatches: Match[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // f) Fair play points (higher = better)
  const byFP = stableSortDesc(tiedTeams, (s) => s.fairPlayPoints);
  const fpGroups = groupByValue(byFP, (s) => s.fairPlayPoints);
  if (fpGroups.length > 1) {
    return fpGroups.flatMap((g) =>
      g.length === 1 ? g : resolveStep3(g)
    );
  }

  return resolveStep3(tiedTeams);
}

// ============================================================
// Step 3: FIFA World Ranking
// ============================================================

function resolveStep3(
  tiedTeams: TeamStanding[]
): TeamStanding[] {
  if (tiedTeams.length <= 1) return tiedTeams;

  // g) FIFA/Coca-Cola Men's World Ranking (lower rank number = better)
  const getRank = (s: TeamStanding) => -(s.team.fifaRanking ?? 9999); // negate so higher = better for stableSortDesc
  const byRank = stableSortDesc(tiedTeams, getRank);
  const rankGroups = groupByValue(byRank, getRank);
  if (rankGroups.length > 1) {
    return rankGroups.flatMap((g) =>
      g.length === 1 ? g : g // h) Previous ranking — not implemented, treat as equal
    );
  }

  // Cannot resolve — drawing of lots (not implemented)
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
