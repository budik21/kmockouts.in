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
  /** All distinct W/D/L outcome patterns per position (e.g. "H|D", "A|H") — complete, not capped */
  outcomePatternsByPosition: { [position: number]: string[] };
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
        outcomePatternsByPosition: { 1: [], 2: [], 3: [], 4: [] },
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
    patternSets: { [pos: number]: Set<string> };
  }>();

  for (const team of teams) {
    teamData.set(team.id, {
      positionCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      edgeSets: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
      edgeScenarios: { 1: [], 2: [], 3: [], 4: [] },
      patternSets: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
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

    // Build pattern key with goal difference (e.g. "H3|D0|A2")
    const patternKey = matchCombo.matchResults.map(r =>
      `${r.shortResult}${Math.abs(r.homeGoals - r.awayGoals)}`
    ).join('|');

    // Record for each team
    for (const s of standings) {
      const data = teamData.get(s.team.id)!;
      data.positionCounts[s.position]++;

      // Track outcome pattern with goal diff (complete, uncapped)
      data.patternSets[s.position].add(patternKey);

      // Team-specific dedup key:
      //   • team's own match  → outcome + GD (matters for tiebreakers)
      //   • other matches     → outcome only (H/D/A); different margins are irrelevant
      const teamDedupKey = matchCombo.matchResults.map((r, i) => {
        const m = remainingMatches[i];
        const isOwn = m.homeTeamId === s.team.id || m.awayTeamId === s.team.id;
        return isOwn
          ? `${r.shortResult}${Math.abs(r.homeGoals - r.awayGoals)}`
          : r.shortResult;
      }).join('|');

      const edgeSet = data.edgeSets[s.position];
      if (edgeSet.size < MAX_EDGES && !edgeSet.has(teamDedupKey)) {
        edgeSet.add(teamDedupKey);
        // Normalise other-match scores to minimal representation so the card
        // doesn't show arbitrary margins for matches the team isn't in.
        data.edgeScenarios[s.position].push(
          normalizeOtherMatchScores(matchCombo, remainingMatches, s.team.id),
        );
      }
    }

    incrementIndices(indices, numBuckets);
  }

  // Build summaries
  return teams.map((team) => {
    const data = teamData.get(team.id)!;
    const probs: { [pos: number]: number } = {};
    const outcomePatterns: { [pos: number]: string[] } = {};
    for (let p = 1; p <= 4; p++) {
      probs[p] = Math.round((data.positionCounts[p] / totalCombinations) * 10000) / 100;
      outcomePatterns[p] = Array.from(data.patternSets[p]);
    }

    return {
      teamId: team.id,
      teamName: team.name,
      positionCounts: data.positionCounts,
      totalScenarios: totalCombinations,
      positionProbabilities: probs,
      edgeScenariosByPosition: data.edgeScenarios,
      outcomePatternsByPosition: outcomePatterns,
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
    patternSets: { [pos: number]: Set<string> };
  }>();

  for (const team of teams) {
    teamData.set(team.id, {
      positionCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      edgeSets: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
      edgeScenarios: { 1: [], 2: [], 3: [], 4: [] },
      patternSets: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
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

    const patternKey = matchCombo.matchResults.map(r =>
      `${r.shortResult}${Math.abs(r.homeGoals - r.awayGoals)}`
    ).join('|');

    for (const s of standings) {
      const data = teamData.get(s.team.id)!;
      data.positionCounts[s.position]++;

      data.patternSets[s.position].add(patternKey);

      const teamDedupKey = matchCombo.matchResults.map((r, i) => {
        const m = remainingMatches[i];
        const isOwn = m.homeTeamId === s.team.id || m.awayTeamId === s.team.id;
        return isOwn
          ? `${r.shortResult}${Math.abs(r.homeGoals - r.awayGoals)}`
          : r.shortResult;
      }).join('|');

      const edgeSet = data.edgeSets[s.position];
      if (edgeSet.size < MAX_EDGES && !edgeSet.has(teamDedupKey)) {
        edgeSet.add(teamDedupKey);
        data.edgeScenarios[s.position].push(
          normalizeOtherMatchScores(matchCombo, remainingMatches, s.team.id),
        );
      }
    }
  }

  return teams.map((team) => {
    const data = teamData.get(team.id)!;
    const probs: { [pos: number]: number } = {};
    const outcomePatterns: { [pos: number]: string[] } = {};
    for (let p = 1; p <= 4; p++) {
      probs[p] = Math.round((data.positionCounts[p] / iterations) * 10000) / 100;
      outcomePatterns[p] = Array.from(data.patternSets[p]);
    }
    return {
      teamId: team.id,
      teamName: team.name,
      positionCounts: data.positionCounts,
      totalScenarios: iterations,
      positionProbabilities: probs,
      edgeScenariosByPosition: data.edgeScenarios,
      outcomePatternsByPosition: outcomePatterns,
    };
  });
}

// ============================================================
// Helpers
// ============================================================

/**
 * Return a copy of a MatchCombination where every match the team is NOT
 * involved in is normalised to the minimal score for its outcome:
 *   home win → 1:0,  draw → 0:0,  away win → 0:1
 *
 * This prevents the scenario list from showing "X 1:0 Y, XX 2:0 YY" and
 * "X 1:0 Y, XX 3:0 YY" as separate entries — only one entry per distinct
 * (own-match outcome+GD) × (other-match W/D/L) combination is kept.
 */
function normalizeOtherMatchScores(
  combo: MatchCombination,
  remainingMatches: Match[],
  teamId: number,
): MatchCombination {
  const matchResults = combo.matchResults.map((r, i) => {
    const m = remainingMatches[i];
    if (m.homeTeamId === teamId || m.awayTeamId === teamId) return r;
    if (r.shortResult === 'H') return { ...r, homeGoals: 1, awayGoals: 0, label: 'Home win by 1' };
    if (r.shortResult === 'A') return { ...r, homeGoals: 0, awayGoals: 1, label: 'Away win by 1' };
    return { ...r, homeGoals: 0, awayGoals: 0, label: 'Draw' };
  });
  return { matchResults, shortKey: combo.shortKey };
}

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
