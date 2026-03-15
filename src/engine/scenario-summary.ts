/**
 * Generates human-readable summary sentences for each position
 * based on outcome patterns (with goal differences) from the scenario engine.
 *
 * Finds the minimum/edge conditions needed for a team to finish
 * in each position and expresses them as concise English sentences.
 */

export interface RemainingMatchInfo {
  matchIndex: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
}

type RawOutcome = 'H' | 'D' | 'A';
type TeamOutcome = 'WIN' | 'DRAW' | 'LOSS';
type ExtOutcome = TeamOutcome | 'DRAW_OR_WIN' | 'DRAW_OR_LOSS' | 'ANY';

interface MatchPatternEntry {
  rawOutcome: RawOutcome;
  goalDiff: number;
}

interface Branch {
  ownConditions: { matchIdx: number; outcome: ExtOutcome; minGoalDiff: number }[];
  otherConstraints: { matchIdx: number; outcomes: Set<RawOutcome> }[];
}

/**
 * Generate a summary sentence for each position (1-4).
 */
export function generateScenarioSummaries(
  teamId: number,
  teamName: string,
  outcomePatternsByPosition: { [pos: number]: string[] },
  remainingMatches: RemainingMatchInfo[],
  probabilities: { [pos: number]: number },
): { [pos: number]: string } {
  const result: { [pos: number]: string } = {};

  for (let pos = 1; pos <= 4; pos++) {
    const prob = probabilities[pos] ?? 0;
    if (prob === 0) continue;
    if (prob === 100) {
      result[pos] = 'Guaranteed.';
      continue;
    }

    const patterns = outcomePatternsByPosition[pos] ?? [];
    if (patterns.length === 0) continue;

    const sentence = summarizePosition(teamId, teamName, patterns, remainingMatches);
    if (sentence) {
      result[pos] = sentence;
    }
  }

  return result;
}

/** Parse a pattern like "H3|D0|A2" into structured entries */
function parsePattern(pattern: string): MatchPatternEntry[] {
  return pattern.split('|').map(part => {
    const rawOutcome = part.charAt(0) as RawOutcome;
    const goalDiff = parseInt(part.slice(1), 10);
    return { rawOutcome, goalDiff };
  });
}

function toTeamOutcome(raw: RawOutcome, matchIdx: number, teamId: number, matches: RemainingMatchInfo[]): TeamOutcome {
  if (raw === 'D') return 'DRAW';
  const m = matches[matchIdx];
  const teamIsHome = m.homeTeamId === teamId;
  if (teamIsHome) return raw === 'H' ? 'WIN' : 'LOSS';
  return raw === 'A' ? 'WIN' : 'LOSS';
}

function summarizePosition(
  teamId: number,
  teamName: string,
  patterns: string[],
  remainingMatches: RemainingMatchInfo[],
): string | null {
  if (remainingMatches.length === 0) return null;

  // Classify matches
  const ownMatchIndices: number[] = [];
  const otherMatchIndices: number[] = [];
  for (let i = 0; i < remainingMatches.length; i++) {
    const m = remainingMatches[i];
    if (m.homeTeamId === teamId || m.awayTeamId === teamId) {
      ownMatchIndices.push(i);
    } else {
      otherMatchIndices.push(i);
    }
  }

  // Parse all patterns
  const parsed = patterns.map(parsePattern);

  // Group by own-match team-relative outcome (WIN/DRAW/LOSS per own match)
  const groups = new Map<string, MatchPatternEntry[][]>();
  for (const entries of parsed) {
    const ownKey = ownMatchIndices.map(i =>
      toTeamOutcome(entries[i].rawOutcome, i, teamId, remainingMatches)
    ).join('|');
    if (!groups.has(ownKey)) groups.set(ownKey, []);
    groups.get(ownKey)!.push(entries);
  }

  // Build branches
  const branches: Branch[] = [];
  for (const [ownKey, groupEntries] of groups) {
    const ownOutcomes = ownKey.split('|') as TeamOutcome[];

    const ownConditions = ownOutcomes.map((outcome, i) => {
      const matchIdx = ownMatchIndices[i];
      // Find minimum goal diff within this group for this match
      const diffs = groupEntries.map(e => e[matchIdx].goalDiff);
      const minGoalDiff = Math.min(...diffs);
      return { matchIdx, outcome: outcome as ExtOutcome, minGoalDiff };
    });

    const otherConstraints: Branch['otherConstraints'] = [];
    for (const idx of otherMatchIndices) {
      const outcomes = new Set<RawOutcome>(groupEntries.map(e => e[idx].rawOutcome));
      otherConstraints.push({ matchIdx: idx, outcomes });
    }

    branches.push({ ownConditions, otherConstraints });
  }

  // Merge branches
  const merged = mergeBranches(branches, ownMatchIndices, otherMatchIndices);

  if (merged.length > 3) {
    return 'Multiple scenarios possible — see details below.';
  }

  return buildSentence(merged, remainingMatches, teamId, teamName);
}

// ============================================================
// Branch merging
// ============================================================

function mergeBranches(
  branches: Branch[],
  ownMatchIndices: number[],
  otherMatchIndices: number[],
): Branch[] {
  if (ownMatchIndices.length === 0) return branches;
  if (ownMatchIndices.length === 1) return mergeSingleOwnMatch(branches, otherMatchIndices);
  return mergeMultiOwnMatches(branches, ownMatchIndices, otherMatchIndices);
}

function mergeSingleOwnMatch(branches: Branch[], otherMatchIndices: number[]): Branch[] {
  const byOutcome = new Map<string, Branch>();
  for (const b of branches) {
    byOutcome.set(b.ownConditions[0].outcome as string, b);
  }

  const winBranch = byOutcome.get('WIN');
  const drawBranch = byOutcome.get('DRAW');
  const lossBranch = byOutcome.get('LOSS');

  // Try merging all three
  if (winBranch && drawBranch && lossBranch &&
    sameOtherConstraints(winBranch, drawBranch) &&
    sameOtherConstraints(winBranch, lossBranch)) {
    return [{
      ownConditions: [{ ...winBranch.ownConditions[0], outcome: 'ANY', minGoalDiff: 0 }],
      otherConstraints: winBranch.otherConstraints,
    }];
  }

  // Try merging win+draw (only if win minGoalDiff is 1 — "any win" + draw = "at least a draw")
  if (winBranch && drawBranch &&
    winBranch.ownConditions[0].minGoalDiff <= 1 &&
    sameOtherConstraints(winBranch, drawBranch)) {
    const result: Branch[] = [{
      ownConditions: [{ ...winBranch.ownConditions[0], outcome: 'DRAW_OR_WIN', minGoalDiff: 0 }],
      otherConstraints: winBranch.otherConstraints,
    }];
    if (lossBranch) result.push(lossBranch);
    return result;
  }

  // Try merging draw+loss
  if (drawBranch && lossBranch &&
    lossBranch.ownConditions[0].minGoalDiff <= 1 &&
    sameOtherConstraints(drawBranch, lossBranch)) {
    const result: Branch[] = [];
    if (winBranch) result.push(winBranch);
    result.push({
      ownConditions: [{ ...drawBranch.ownConditions[0], outcome: 'DRAW_OR_LOSS', minGoalDiff: 0 }],
      otherConstraints: drawBranch.otherConstraints,
    });
    return result;
  }

  // No merging — order: win, draw, loss
  const result: Branch[] = [];
  if (winBranch) result.push(winBranch);
  if (drawBranch) result.push(drawBranch);
  if (lossBranch) result.push(lossBranch);
  return result;
}

function mergeMultiOwnMatches(
  branches: Branch[],
  ownMatchIndices: number[],
  otherMatchIndices: number[],
): Branch[] {
  const allUnconstrained = branches.every(b =>
    b.otherConstraints.every(c => c.outcomes.size === 3)
  );

  if (allUnconstrained) {
    const perMatch = new Map<number, Set<string>>();
    for (const idx of ownMatchIndices) perMatch.set(idx, new Set());
    for (const b of branches) {
      for (const oc of b.ownConditions) {
        perMatch.get(oc.matchIdx)!.add(oc.outcome as string);
      }
    }

    const allAny = Array.from(perMatch.values()).every(s =>
      s.has('WIN') && s.has('DRAW') && s.has('LOSS')
    );
    if (allAny) {
      return [{
        ownConditions: ownMatchIndices.map(idx => ({ matchIdx: idx, outcome: 'ANY' as ExtOutcome, minGoalDiff: 0 })),
        otherConstraints: branches[0].otherConstraints,
      }];
    }
  }

  if (branches.length > 3) {
    return branches.slice(0, 4); // will trigger complexity cap
  }

  return branches;
}

function sameOtherConstraints(a: Branch, b: Branch): boolean {
  if (a.otherConstraints.length !== b.otherConstraints.length) return false;
  for (let i = 0; i < a.otherConstraints.length; i++) {
    const aSet = a.otherConstraints[i]?.outcomes;
    const bSet = b.otherConstraints[i]?.outcomes;
    if (!aSet || !bSet || aSet.size !== bSet.size) return false;
    for (const v of aSet) {
      if (!bSet.has(v)) return false;
    }
  }
  return true;
}

// ============================================================
// Sentence generation
// ============================================================

function buildSentence(
  branches: Branch[],
  remainingMatches: RemainingMatchInfo[],
  teamId: number,
  teamName: string,
): string {
  if (branches.length === 0) return '';

  const parts: string[] = [];

  for (const b of branches) {
    const conditions: string[] = [];

    for (const oc of b.ownConditions) {
      const m = remainingMatches[oc.matchIdx];
      const teamIsHome = m.homeTeamId === teamId;
      const opponent = teamIsHome ? m.awayTeamName : m.homeTeamName;
      const desc = describeOwnOutcome(oc.outcome, oc.minGoalDiff, teamName, opponent);
      if (desc) conditions.push(desc);
    }

    for (const oc of b.otherConstraints) {
      if (oc.outcomes.size === 3) continue;
      const m = remainingMatches[oc.matchIdx];
      const desc = describeOtherOutcome(oc.outcomes, m.homeTeamName, m.awayTeamName);
      if (desc) conditions.push(desc);
    }

    if (conditions.length === 0) {
      parts.push('any combination of results');
    } else {
      parts.push(conditions.join(' and '));
    }
  }

  if (parts.length === 1) {
    return capitalize(parts[0]) + '.';
  }

  return parts.map((p, i) => i === 0 ? capitalize(p) : p).join('; or ') + '.';
}

function describeOwnOutcome(
  outcome: ExtOutcome,
  minGoalDiff: number,
  teamName: string,
  opponent: string,
): string | null {
  const team = `<strong>${teamName}</strong>`;
  const opp = `<strong>${opponent}</strong>`;

  switch (outcome) {
    case 'ANY':
      return null;
    case 'DRAW_OR_WIN':
      return `${team} at least draws with ${opp}`;
    case 'DRAW_OR_LOSS':
      return `${team} draws with or loses to ${opp}`;
    case 'WIN':
      if (minGoalDiff > 1) {
        return `${team} beats ${opp} by at least ${minGoalDiff} goals`;
      }
      return `${team} beats ${opp}`;
    case 'DRAW':
      return `${team} draws with ${opp}`;
    case 'LOSS':
      if (minGoalDiff > 1) {
        return `${team} loses to ${opp} by at least ${minGoalDiff} goals`;
      }
      return `${team} loses to ${opp}`;
    default:
      return null;
  }
}

function describeOtherOutcome(
  outcomes: Set<RawOutcome>,
  homeName: string,
  awayName: string,
): string | null {
  if (outcomes.size === 3) return null;

  const home = `<strong>${homeName}</strong>`;
  const away = `<strong>${awayName}</strong>`;

  if (outcomes.size === 1) {
    const o = outcomes.values().next().value;
    if (o === 'H') return `${home} beats ${away}`;
    if (o === 'A') return `${away} beats ${home}`;
    if (o === 'D') return `${home} and ${away} draw`;
  }

  if (outcomes.size === 2) {
    if (outcomes.has('H') && outcomes.has('D')) return `${home} doesn't lose to ${away}`;
    if (outcomes.has('A') && outcomes.has('D')) return `${away} doesn't lose to ${home}`;
    if (outcomes.has('H') && outcomes.has('A')) return `${home} vs ${away} doesn't end in a draw`;
  }

  return null;
}

function capitalize(s: string): string {
  if (!s) return s;
  if (s.startsWith('<strong>')) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
