/**
 * Best third-placed teams calculation.
 *
 * FIFA WC2026: 8 of 12 third-placed teams qualify for Round of 32.
 * Uses Monte Carlo simulation to estimate the probability of
 * a third-placed team qualifying across all groups.
 */

import { Match, Team, TeamStanding, GroupId } from '../lib/types';
import { SCORE_BUCKETS, MONTE_CARLO_ITERATIONS, ALL_GROUPS, QUALIFY_BEST_THIRD } from '../lib/constants';
import { calculateStandings } from './standings';

export interface GroupData {
  groupId: GroupId;
  teams: Team[];
  playedMatches: Match[];
  remainingMatches: Match[];
}

export interface BestThirdResult {
  /** For each group, probability that the third-placed team qualifies */
  groupProbabilities: Map<GroupId, number>;
  /** For each team (by id), probability they finish 3rd AND qualify as best-third */
  teamProbabilities: Map<number, number>;
}

/**
 * Third-placed teams are ranked by (FIFA Article 13):
 * 1. Points
 * 2. Goal difference
 * 3. Goals scored
 * 4. Fair play points
 * 5. FIFA/Coca-Cola Men's World Ranking
 */
export function compareThirdPlaced(a: TeamStanding, b: TeamStanding): number {
  // Higher points first
  if (b.points !== a.points) return b.points - a.points;
  // Higher GD first
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  // More goals scored first
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  // Fair play (higher = better, less negative)
  if (b.fairPlayPoints !== a.fairPlayPoints) return b.fairPlayPoints - a.fairPlayPoints;
  // FIFA World Ranking (lower rank number = better)
  const aRank = a.team.fifaRanking ?? 9999;
  const bRank = b.team.fifaRanking ?? 9999;
  if (aRank !== bRank) return aRank - bRank;
  // Equal
  return 0;
}

/**
 * Run Monte Carlo simulation to determine best-third qualification probabilities.
 */
export function calculateBestThirdProbabilities(
  allGroups: GroupData[],
  iterations: number = MONTE_CARLO_ITERATIONS
): BestThirdResult {
  const numBuckets = SCORE_BUCKETS.length;

  // Count how often each group's third-placed team qualifies
  const qualifyCount = new Map<GroupId, number>();
  for (const g of ALL_GROUPS) {
    qualifyCount.set(g, 0);
  }

  // Count how often each specific team qualifies as best-third
  const teamQualifyCount = new Map<number, number>();

  for (let iter = 0; iter < iterations; iter++) {
    // For each group, simulate remaining matches and get standings
    const thirdPlaced: { groupId: GroupId; standing: TeamStanding }[] = [];

    for (const group of allGroups) {
      // Simulate remaining matches with random buckets
      const simulatedMatches = group.remainingMatches.map((m) => {
        const bucket = SCORE_BUCKETS[Math.floor(Math.random() * numBuckets)];
        return {
          ...m,
          homeGoals: bucket.homeGoals,
          awayGoals: bucket.awayGoals,
          status: 'FINISHED' as const,
        };
      });

      const allMatches = [...group.playedMatches, ...simulatedMatches];
      const standings = calculateStandings({ teams: group.teams, matches: allMatches });

      // Third-placed team (position 3)
      const third = standings.find((s) => s.position === 3);
      if (third) {
        thirdPlaced.push({ groupId: group.groupId, standing: third });
      }
    }

    // Rank all third-placed teams
    thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

    // Top 8 qualify
    const qualifiers = thirdPlaced.slice(0, QUALIFY_BEST_THIRD);
    for (const q of qualifiers) {
      qualifyCount.set(q.groupId, (qualifyCount.get(q.groupId) ?? 0) + 1);
      // Track per-team qualification
      const teamId = q.standing.team.id;
      teamQualifyCount.set(teamId, (teamQualifyCount.get(teamId) ?? 0) + 1);
    }
  }

  // Convert to probabilities
  const groupProbabilities = new Map<GroupId, number>();
  for (const g of ALL_GROUPS) {
    const count = qualifyCount.get(g) ?? 0;
    groupProbabilities.set(g, Math.round((count / iterations) * 10000) / 100);
  }

  const teamProbabilities = new Map<number, number>();
  for (const [teamId, count] of teamQualifyCount) {
    teamProbabilities.set(teamId, Math.round((count / iterations) * 10000) / 100);
  }

  return { groupProbabilities, teamProbabilities };
}
