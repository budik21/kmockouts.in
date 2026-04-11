/**
 * Post-hoc tiebreaker analysis.
 *
 * Given final sorted standings and all matches, produces human-readable
 * explanations for non-obvious ordering decisions (same pts + same GD,
 * H2H overriding overall GD, multi-way ties, etc.).
 */

import { Match, TeamStanding } from '../lib/types';
import { getHeadToHeadMatches } from './standings';

/* ── H2H helpers (mirroring tiebreaker.ts logic) ── */

interface H2HStats {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

function calcH2H(teams: TeamStanding[], matches: Match[]): Map<number, H2HStats> {
  const teamIds = new Set(teams.map((t) => t.team.id));
  const h2hMatches = getHeadToHeadMatches(teamIds, matches);

  const stats = new Map<number, H2HStats>();
  for (const t of teams) {
    stats.set(t.team.id, { points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
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

/* ── Formatting ── */

function fmtGD(gd: number): string {
  return gd > 0 ? `+${gd}` : `${gd}`;
}

function allSame(vals: number[]): boolean {
  return vals.every((v) => v === vals[0]);
}

/* ── Public API ── */

/**
 * Analyze the final standings and return explanations for non-obvious
 * tiebreaker decisions. Returns an empty array when everything is obvious.
 */
export function explainTiebreakers(
  standings: TeamStanding[],
  matches: Match[],
): string[] {
  const explanations: string[] = [];

  let i = 0;
  while (i < standings.length) {
    let j = i + 1;
    while (j < standings.length && standings[j].points === standings[i].points) {
      j++;
    }

    if (j - i >= 3) {
      const expl = analyzeMultiWayTie(standings.slice(i, j), matches);
      if (expl) explanations.push(expl);
    } else if (j - i === 2) {
      const expl = analyzePair(standings[i], standings[i + 1], matches);
      if (expl) explanations.push(expl);
    }

    i = j;
  }

  return explanations;
}

/* ── 2-team tie ── */

function analyzePair(
  a: TeamStanding,
  b: TeamStanding,
  matches: Match[],
): string | null {
  const pts = a.points;
  const h2h = calcH2H([a, b], matches);
  const aH = h2h.get(a.team.id)!;
  const bH = h2h.get(b.team.id)!;

  // H2H points differ (one beat the other outright)
  if (aH.points !== bH.points) {
    if (a.goalDifference < b.goalDifference) {
      // Counter-intuitive: worse overall GD but ahead on H2H
      return `${a.team.shortName} ahead of ${b.team.shortName} despite lower GD (${fmtGD(a.goalDifference)} vs ${fmtGD(b.goalDifference)}) — won head-to-head`;
    }
    if (a.goalDifference === b.goalDifference) {
      return `${a.team.shortName} & ${b.team.shortName} tied on ${pts} pts, ${fmtGD(a.goalDifference)} GD — ${a.team.shortName} ahead on head-to-head`;
    }
    // H2H agrees with GD → obvious enough
    return null;
  }

  // H2H points same (drew or didn't play both legs yet)
  if (aH.goalDifference !== bH.goalDifference) {
    if (a.goalDifference === b.goalDifference) {
      return `${a.team.shortName} & ${b.team.shortName} tied on ${pts} pts, ${fmtGD(a.goalDifference)} GD — H2H GD: ${a.team.shortName} ${fmtGD(aH.goalDifference)}, ${b.team.shortName} ${fmtGD(bH.goalDifference)}`;
    }
    if (a.goalDifference < b.goalDifference) {
      return `${a.team.shortName} ahead of ${b.team.shortName} despite lower GD (${fmtGD(a.goalDifference)} vs ${fmtGD(b.goalDifference)}) — H2H GD: ${a.team.shortName} ${fmtGD(aH.goalDifference)}, ${b.team.shortName} ${fmtGD(bH.goalDifference)}`;
    }
    return null;
  }

  // H2H fully tied → falls through to overall stats
  if (a.goalDifference === b.goalDifference) {
    // Same overall GD too
    if (a.goalsFor !== b.goalsFor) {
      return `${a.team.shortName} & ${b.team.shortName} tied on ${pts} pts, ${fmtGD(a.goalDifference)} GD — ${a.team.shortName} ahead on goals scored (${a.goalsFor} vs ${b.goalsFor})`;
    }
    // Fair play or FIFA ranking
    if (a.team.fifaRanking && b.team.fifaRanking && a.team.fifaRanking !== b.team.fifaRanking) {
      return `${a.team.shortName} & ${b.team.shortName} fully tied — decided by FIFA ranking (${a.team.fifaRanking} vs ${b.team.fifaRanking})`;
    }
    return null;
  }

  // Different overall GD, no H2H override → obvious
  return null;
}

/* ── 3+ team tie ── */

function analyzeMultiWayTie(
  group: TeamStanding[],
  matches: Match[],
): string | null {
  const pts = group[0].points;
  const shorts = group.map((s) => s.team.shortName);
  const h2h = calcH2H(group, matches);

  // 1a) H2H points
  const h2hPts = group.map((s) => h2h.get(s.team.id)!.points);
  if (!allSame(h2hPts)) {
    const detail = group.map((s) => `${s.team.shortName} ${h2h.get(s.team.id)!.points}`).join(', ');
    return `${shorts.join(', ')} tied on ${pts} pts — H2H points: ${detail}`;
  }

  // 1b) H2H GD
  const h2hGDs = group.map((s) => h2h.get(s.team.id)!.goalDifference);
  if (!allSame(h2hGDs)) {
    const detail = group.map((s) => `${s.team.shortName} ${fmtGD(h2h.get(s.team.id)!.goalDifference)}`).join(', ');
    return `${shorts.join(', ')} tied on ${pts} pts — H2H GD: ${detail}`;
  }

  // 1c) H2H goals scored
  const h2hGFs = group.map((s) => h2h.get(s.team.id)!.goalsFor);
  if (!allSame(h2hGFs)) {
    const detail = group.map((s) => `${s.team.shortName} ${h2h.get(s.team.id)!.goalsFor}`).join(', ');
    return `${shorts.join(', ')} tied on ${pts} pts — H2H goals scored: ${detail}`;
  }

  // 2d) Overall GD
  const gds = group.map((s) => s.goalDifference);
  if (!allSame(gds)) {
    const detail = group.map((s) => `${s.team.shortName} ${fmtGD(s.goalDifference)}`).join(', ');
    return `${shorts.join(', ')} tied on ${pts} pts & H2H — overall GD: ${detail}`;
  }

  // 2e) Overall goals scored
  const gfs = group.map((s) => s.goalsFor);
  if (!allSame(gfs)) {
    const detail = group.map((s) => `${s.team.shortName} ${s.goalsFor}`).join(', ');
    return `${shorts.join(', ')} tied on ${pts} pts, ${fmtGD(gds[0])} GD — goals scored: ${detail}`;
  }

  // 2f / 3g) Fair play or FIFA ranking
  return `${shorts.join(', ')} tied on ${pts} pts — decided by FIFA ranking`;
}
