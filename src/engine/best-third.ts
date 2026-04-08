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

export interface PointsBreakdownEntry {
  points: number;
  /** % of iterations where 8th place had strictly fewer points (having this many pts always qualifies) */
  pctQualifyRegardless: number;
  /** % of iterations where 8th place had exactly this many points (GD tiebreaker needed) */
  pctExact: number;
  /** Median GD of the 8th-place team when it had exactly this many points */
  medianGD: number;
  /** Maximum GD seen at 8th place for this point value (worst case — you need more than this) */
  maxGD: number;
  /** For selected GD thresholds: what total % of scenarios would a team with (pts, GD) qualify?
   *  e.g. [{gd: -1, pctQualify: 72}, {gd: 0, pctQualify: 80}, ...] */
  gdThresholds: { gd: number; pctQualify: number }[];
}

export interface QualificationThreshold {
  pointsBreakdown: PointsBreakdownEntry[];
  totalIterations: number;
}

export interface BestThirdResult {
  /** For each group, probability that the third-placed team qualifies */
  groupProbabilities: Map<GroupId, number>;
  /** For each team (by id), probability they finish 3rd AND qualify as best-third */
  teamProbabilities: Map<number, number>;
  /** What stats the 8th-place team typically has — useful for "what do I need to qualify" */
  qualificationThreshold: QualificationThreshold | null;
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

  // Track 8th-place team stats for qualification threshold
  const eighthPlaceStats: { points: number; gd: number }[] = [];

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

    // Record 8th-place team's stats (the last qualifier)
    if (thirdPlaced.length >= QUALIFY_BEST_THIRD) {
      const eighth = thirdPlaced[QUALIFY_BEST_THIRD - 1];
      eighthPlaceStats.push({
        points: eighth.standing.points,
        gd: eighth.standing.goalDifference,
      });
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

  // Compute qualification threshold from 8th-place stats
  const qualificationThreshold = computeQualificationThreshold(eighthPlaceStats);

  return { groupProbabilities, teamProbabilities, qualificationThreshold };
}

/**
 * Compute a summary of what the 8th-place team typically looks like.
 */
function computeQualificationThreshold(
  stats: { points: number; gd: number }[],
): QualificationThreshold | null {
  if (stats.length === 0) return null;
  const total = stats.length;

  // Group by points value
  const byPoints = new Map<number, number[]>();
  for (const s of stats) {
    if (!byPoints.has(s.points)) byPoints.set(s.points, []);
    byPoints.get(s.points)!.push(s.gd);
  }

  // Sort point values ascending for cumulative calculation
  const pointValues = Array.from(byPoints.keys()).sort((a, b) => a - b);

  // Pre-compute: for each point value, how many iterations had 8th.points strictly less
  // (cumulative count of iterations with lower point values)
  const countBelow = new Map<number, number>();
  let cumBelow = 0;
  for (const pts of pointValues) {
    countBelow.set(pts, cumBelow);
    cumBelow += byPoints.get(pts)!.length;
  }

  // Build breakdown sorted by points descending (highest first)
  const breakdown: PointsBreakdownEntry[] = [];

  for (const pts of [...pointValues].reverse()) {
    const gds = byPoints.get(pts)!;
    const count = gds.length;
    const pctExact = round2((count / total) * 100);
    const pctQualifyRegardless = round2((countBelow.get(pts)! / total) * 100);

    gds.sort((a, b) => a - b);
    const medianGD = gds[Math.floor(gds.length / 2)];
    const maxGD = gds[gds.length - 1];

    // For selected GD thresholds, compute total qualify %:
    // qualify = (8th.pts < pts) + (8th.pts == pts AND 8th.GD <= gd)
    const gdRange = Array.from(new Set([-3, -2, -1, 0, 1, 2, 3, medianGD, maxGD]))
      .sort((a, b) => a - b);
    const gdThresholds: { gd: number; pctQualify: number }[] = [];
    const below = countBelow.get(pts)!;
    for (const g of gdRange) {
      // Count iterations where 8th had exactly pts points AND GD <= g
      const countAtOrBelow = gds.filter(v => v <= g).length;
      const pctQualify = round2(((below + countAtOrBelow) / total) * 100);
      gdThresholds.push({ gd: g, pctQualify });
    }

    breakdown.push({
      points: pts,
      pctQualifyRegardless,
      pctExact,
      medianGD,
      maxGD,
      gdThresholds,
    });
  }

  return { pointsBreakdown: breakdown, totalIterations: total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
