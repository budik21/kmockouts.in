/**
 * Standings calculation engine.
 * Aggregates match results into a group standings table,
 * applying FIFA WC2026 Article 13 tiebreaker rules.
 */

import { Match, Team, TeamStanding, GroupId } from '../lib/types';
import { calculateFairPlayPoints } from './fair-play';
import { sortByTiebreaker } from './tiebreaker';

export interface StandingsInput {
  teams: Team[];
  matches: Match[];  // only finished matches (or simulated)
}

/**
 * Build raw (unsorted) team standing data from finished matches.
 */
function aggregateStandings(teams: Team[], matches: Match[]): TeamStanding[] {
  // Initialize standings map
  const map = new Map<number, TeamStanding>();
  for (const team of teams) {
    map.set(team.id, {
      team,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      yellowCards: 0,
      secondYellows: 0,
      redCardsDirect: 0,
      yellowAndDirectRed: 0,
      fairPlayPoints: 0,
      position: 0,
    });
  }

  // Process each finished match
  for (const m of matches) {
    if (m.homeGoals === null || m.awayGoals === null) continue;

    const home = map.get(m.homeTeamId);
    const away = map.get(m.awayTeamId);
    if (!home || !away) continue;

    home.matchesPlayed++;
    away.matchesPlayed++;

    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;

    if (m.homeGoals > m.awayGoals) {
      home.wins++;
      home.points += 3;
      away.losses++;
    } else if (m.homeGoals < m.awayGoals) {
      away.wins++;
      away.points += 3;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
      home.points += 1;
      away.points += 1;
    }

    // Disciplinary
    home.yellowCards += m.homeYc;
    home.secondYellows += m.homeYc2;
    home.redCardsDirect += m.homeRcDirect;
    home.yellowAndDirectRed += m.homeYcRc;
    away.yellowCards += m.awayYc;
    away.secondYellows += m.awayYc2;
    away.redCardsDirect += m.awayRcDirect;
    away.yellowAndDirectRed += m.awayYcRc;
  }

  // Compute derived fields
  for (const s of map.values()) {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
    s.fairPlayPoints = calculateFairPlayPoints({
      yellowCards: s.yellowCards,
      secondYellows: s.secondYellows,
      redCardsDirect: s.redCardsDirect,
      yellowAndDirectRed: s.yellowAndDirectRed,
    });
  }

  return Array.from(map.values());
}

/**
 * Calculate full group standings: aggregate + sort by FIFA tiebreaker rules.
 */
export function calculateStandings(input: StandingsInput): TeamStanding[] {
  const standings = aggregateStandings(input.teams, input.matches);
  const sorted = sortByTiebreaker(standings, input.matches);

  // Assign positions
  sorted.forEach((s, i) => {
    s.position = i + 1;
  });

  return sorted;
}

/**
 * Get head-to-head matches between a subset of teams.
 */
export function getHeadToHeadMatches(
  teamIds: Set<number>,
  matches: Match[]
): Match[] {
  return matches.filter(
    (m) =>
      m.homeGoals !== null &&
      m.awayGoals !== null &&
      teamIds.has(m.homeTeamId) &&
      teamIds.has(m.awayTeamId)
  );
}
