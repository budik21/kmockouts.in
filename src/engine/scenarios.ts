/**
 * Scenario enumeration engine.
 *
 * Uses 14 score-range buckets (goal difference from 1 to 6+)
 * to enumerate all possible outcomes for remaining matches.
 *
 * When remaining matches <= 5: full enumeration (max 14^5 = 537,824)
 * When remaining matches == 6: Monte Carlo fallback (50K simulations)
 */

import { Match, Team, TeamStanding, ScoreBucket } from '../lib/types';
import { SCORE_BUCKETS, MONTE_CARLO_THRESHOLD } from '../lib/constants';
import { calculateStandings } from './standings';

export interface TeamScenarioSummary {
  teamId: number;
  teamName: string;
  /** Count of scenarios where team finishes at each position */
  positionCounts: { [position: number]: number };
  /** Total scenarios evaluated */
  totalScenarios: number;
  /** Percentage for each position */
  positionProbabilities: { [position: number]: number };
  /** Deduplicated edge scenarios grouped by position */
  edgeScenariosByPosition: { [position: number]: MatchCombination[] };
}

/** A single match result within a combination */
export interface MatchResultInCombination {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  label: string;
  /** Short result: "H" = home win, "D" = draw, "A" = away win */
  shortResult: string;
}

/** A combination of match results leading to a specific position */
export interface MatchCombination {
  matchResults: MatchResultInCombination[];
  /** Dedupe key: e.g. "H-D-A" — the W/D/L pattern */
  shortKey: string;
}

/**
 * Enumerate all possible outcomes for remaining matches in a group.
 */
export function enumerateGroupScenarios(
  teams: Team[],
  playedMatches: Match[],
  remainingMatches: Match[]
): TeamScenarioSummary[] {
  const numRemaining = remainingMatches.length;

  if (numRemaining === 0) {
    const standings = calculateStandings({ teams, matches: playedMatches });
    return teams.map((team) => {
      const pos = standings.find((s) => s.team.id === team.id)?.position ?? 4;
      const positionCounts: { [p: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };
      positionCounts[pos] = 1;
      return {
        teamId: team.id,
        teamName: team.name,
        positionCounts,
        totalScenarios: 1,
        positionProbabilities: {
          1: pos === 1 ? 100 : 0, 2: pos === 2 ? 100 : 0,
          3: pos === 3 ? 100 : 0, 4: pos === 4 ? 100 : 0,
        },
        edgeScenariosByPosition: { 1: [], 2: [], 3: [], 4: [] },
      };
    });
  }

  if (numRemaining >= MONTE_CARLO_THRESHOLD) {
    return monteCarloGroupScenarios(teams, playedMatches, remainingMatches, 50_000);
  }

  return fullEnumerationScenarios(teams, playedMatches, remainingMatches);
}

/**
 * Full enumeration: iterate over all bucket combinations.
 */
function fullEnumerationScenarios(
  teams: Team[],
  playedMatches: Match[],
  remainingMatches: Match[]
): TeamScenarioSummary[] {
  const numRemaining = remainingMatches.length;
  const numBuckets = SCORE_BUCKETS.length;
  const totalCombinations = Math.pow(numBuckets, numRemaining);

  // Initialize per-team data
  const teamData = new Map<number, {
    positionCounts: { [pos: number]: number };
    edgeSets: { [pos: number]: Set<string> };
    edgeScenarios: { [pos: number]: MatchCombination[] };
  }>();

  for (const team of teams) {
    teamData.set(team.id, {
      positionCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      edgeSets: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
      edgeScenarios: { 1: [], 2: [], 3: [], 4: [] },
    });
  }

  // Max unique edge scenarios per position per team
  const MAX_EDGES = 50;

  // Enumerate all combinations
  const indices = new Array(numRemaining).fill(0);

  for (let combo = 0; combo < totalCombinations; combo++) {
    // Build simulated matches
    const simulatedMatches = buildSimulatedMatches(remainingMatches, indices);
    const allMatches = [...playedMatches, ...simulatedMatches];
    const standings = calculateStandings({ teams, matches: allMatches });

    // Build the match combination description
    const matchCombo = buildMatchCombination(remainingMatches, indices);

    // Record for each team
    for (const s of standings) {
      const data = teamData.get(s.team.id)!;
      data.positionCounts[s.position]++;

      // Deduplicate by short key (W/D/L pattern)
      const edgeSet = data.edgeSets[s.position];
      if (edgeSet.size < MAX_EDGES && !edgeSet.has(matchCombo.shortKey)) {
        edgeSet.add(matchCombo.shortKey);
        data.edgeScenarios[s.position].push(matchCombo);
      }
    }

    incrementIndices(indices, numBuckets);
  }

  // Build summaries
  return teams.map((team) => {
    const data = teamData.get(team.id)!;
    const probs: { [pos: number]: number } = {};
    for (let p = 1; p <= 4; p++) {
      probs[p] = Math.round((data.positionCounts[p] / totalCombinations) * 10000) / 100;
    }

    return {
      teamId: team.id,
      teamName: team.name,
      positionCounts: data.positionCounts,
      totalScenarios: totalCombinations,
      positionProbabilities: probs,
      edgeScenariosByPosition: data.edgeScenarios,
    };
  });
}

/**
 * Monte Carlo fallback.
 */
function monteCarloGroupScenarios(
  teams: Team[],
  playedMatches: Match[],
  remainingMatches: Match[],
  iterations: number
): TeamScenarioSummary[] {
  const numRemaining = remainingMatches.length;
  const numBuckets = SCORE_BUCKETS.length;
  const MAX_EDGES = 30;

  const teamData = new Map<number, {
    positionCounts: { [pos: number]: number };
    edgeSets: { [pos: number]: Set<string> };
    edgeScenarios: { [pos: number]: MatchCombination[] };
  }>();

  for (const team of teams) {
    teamData.set(team.id, {
      positionCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      edgeSets: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
      edgeScenarios: { 1: [], 2: [], 3: [], 4: [] },
    });
  }

  for (let iter = 0; iter < iterations; iter++) {
    const indices = Array.from({ length: numRemaining }, () =>
      Math.floor(Math.random() * numBuckets)
    );

    const simulatedMatches = buildSimulatedMatches(remainingMatches, indices);
    const allMatches = [...playedMatches, ...simulatedMatches];
    const standings = calculateStandings({ teams, matches: allMatches });
    const matchCombo = buildMatchCombination(remainingMatches, indices);

    for (const s of standings) {
      const data = teamData.get(s.team.id)!;
      data.positionCounts[s.position]++;

      const edgeSet = data.edgeSets[s.position];
      if (edgeSet.size < MAX_EDGES && !edgeSet.has(matchCombo.shortKey)) {
        edgeSet.add(matchCombo.shortKey);
        data.edgeScenarios[s.position].push(matchCombo);
      }
    }
  }

  return teams.map((team) => {
    const data = teamData.get(team.id)!;
    const probs: { [pos: number]: number } = {};
    for (let p = 1; p <= 4; p++) {
      probs[p] = Math.round((data.positionCounts[p] / iterations) * 10000) / 100;
    }
    return {
      teamId: team.id,
      teamName: team.name,
      positionCounts: data.positionCounts,
      totalScenarios: iterations,
      positionProbabilities: probs,
      edgeScenariosByPosition: data.edgeScenarios,
    };
  });
}

// ============================================================
// Helpers
// ============================================================

function buildSimulatedMatches(
  remainingMatches: Match[],
  bucketIndices: number[]
): Match[] {
  return remainingMatches.map((m, i) => {
    const bucket = SCORE_BUCKETS[bucketIndices[i]];
    return {
      ...m,
      homeGoals: bucket.homeGoals,
      awayGoals: bucket.awayGoals,
      status: 'FINISHED' as const,
    };
  });
}

function buildMatchCombination(
  remainingMatches: Match[],
  bucketIndices: number[]
): MatchCombination {
  const matchResults: MatchResultInCombination[] = remainingMatches.map((m, i) => {
    const bucket = SCORE_BUCKETS[bucketIndices[i]];
    const shortResult = bucket.homeGoals > bucket.awayGoals ? 'H'
      : bucket.homeGoals < bucket.awayGoals ? 'A' : 'D';
    return {
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: bucket.homeGoals,
      awayGoals: bucket.awayGoals,
      label: bucket.label,
      shortResult,
    };
  });

  const shortKey = matchResults.map((r) => `${r.shortResult}${r.homeGoals}-${r.awayGoals}`).join('|');

  return { matchResults, shortKey };
}

function incrementIndices(indices: number[], base: number): void {
  for (let i = indices.length - 1; i >= 0; i--) {
    indices[i]++;
    if (indices[i] < base) return;
    indices[i] = 0;
  }
}
