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
    const goalDiff = parseInt(part.slice(1), 10) || 0;
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

  if (merged.length > 5) {
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

interface OwnTuple {
  outcomes: TeamOutcome[];
  minGoalDiffs: number[];
}

function mergeMultiOwnMatches(
  branches: Branch[],
  ownMatchIndices: number[],
  _otherMatchIndices: number[],
): Branch[] {
  // Group branches by their other-constraints
  const constraintGroups = new Map<string, Branch[]>();
  for (const b of branches) {
    const key = constraintKey(b);
    if (!constraintGroups.has(key)) constraintGroups.set(key, []);
    constraintGroups.get(key)!.push(b);
  }

  const allMerged: Branch[] = [];

  for (const group of constraintGroups.values()) {
    const otherConstraints = group[0].otherConstraints;

    // Extract and deduplicate own-outcome tuples
    const tupleMap = new Map<string, number[]>();
    for (const b of group) {
      const key = b.ownConditions.map(c => c.outcome).join('|');
      if (!tupleMap.has(key)) {
        tupleMap.set(key, b.ownConditions.map(c => c.minGoalDiff));
      } else {
        const existing = tupleMap.get(key)!;
        for (let i = 0; i < existing.length; i++) {
          existing[i] = Math.min(existing[i], b.ownConditions[i].minGoalDiff);
        }
      }
    }

    const tuples: OwnTuple[] = Array.from(tupleMap.entries()).map(([key, diffs]) => ({
      outcomes: key.split('|') as TeamOutcome[],
      minGoalDiffs: diffs,
    }));

    const merged = mergeOwnTuples(tuples, ownMatchIndices, otherConstraints);
    allMerged.push(...merged);
  }

  return allMerged;
}

function constraintKey(b: Branch): string {
  return b.otherConstraints
    .map(c => `${c.matchIdx}:${Array.from(c.outcomes).sort().join(',')}`)
    .join('|');
}

/**
 * Recursively merge own-outcome tuples by factoring across dimensions.
 * For each dimension as "pivot", groups by that outcome, recursively
 * merges remaining dimensions, then tries a second-pass merge across
 * the pivot dimension.
 */
function mergeOwnTuples(
  tuples: OwnTuple[],
  ownMatchIndices: number[],
  otherConstraints: Branch['otherConstraints'],
): Branch[] {
  if (tuples.length === 0) return [];

  // Single tuple → single branch
  if (tuples.length === 1) {
    return [{
      ownConditions: tuples[0].outcomes.map((outcome, i) => ({
        matchIdx: ownMatchIndices[i],
        outcome: outcome as ExtOutcome,
        minGoalDiff: tuples[0].minGoalDiffs[i],
      })),
      otherConstraints,
    }];
  }

  const numDims = ownMatchIndices.length;

  // Fast path: all 3^n combinations present → everything is ANY
  const allAny = ownMatchIndices.every((_, d) => {
    const outcomes = new Set(tuples.map(t => t.outcomes[d]));
    return outcomes.has('WIN') && outcomes.has('DRAW') && outcomes.has('LOSS');
  });
  if (allAny && tuples.length >= Math.pow(3, numDims)) {
    return [{
      ownConditions: ownMatchIndices.map(idx => ({
        matchIdx: idx, outcome: 'ANY' as ExtOutcome, minGoalDiff: 0,
      })),
      otherConstraints,
    }];
  }

  // Single dimension: direct merge (W+D→DRAW_OR_WIN, etc.)
  if (numDims === 1) {
    return mergeSingleDimTuples(tuples, ownMatchIndices[0], otherConstraints);
  }

  // Multi-dimension: try factoring by each dimension, pick best
  let bestResult: Branch[] | null = null;

  for (let pivotDim = 0; pivotDim < numDims; pivotDim++) {
    const result = factorByDim(tuples, pivotDim, ownMatchIndices, otherConstraints);
    if (!bestResult || result.length < bestResult.length) {
      bestResult = result;
    }
  }

  // If factoring didn't reduce, return original tuples as branches
  if (!bestResult || bestResult.length >= tuples.length) {
    return tuples.map(t => ({
      ownConditions: t.outcomes.map((outcome, i) => ({
        matchIdx: ownMatchIndices[i],
        outcome: outcome as ExtOutcome,
        minGoalDiff: t.minGoalDiffs[i],
      })),
      otherConstraints,
    }));
  }

  return bestResult;
}

/** Base case: merge outcomes for a single own match. */
function mergeSingleDimTuples(
  tuples: OwnTuple[],
  matchIdx: number,
  otherConstraints: Branch['otherConstraints'],
): Branch[] {
  const outcomes = new Set(tuples.map(t => t.outcomes[0]));
  const minDiffByOutcome = new Map<TeamOutcome, number>();
  for (const t of tuples) {
    const current = minDiffByOutcome.get(t.outcomes[0]);
    minDiffByOutcome.set(
      t.outcomes[0],
      current !== undefined ? Math.min(current, t.minGoalDiffs[0]) : t.minGoalDiffs[0],
    );
  }

  // All three → ANY
  if (outcomes.has('WIN') && outcomes.has('DRAW') && outcomes.has('LOSS')) {
    return [{ ownConditions: [{ matchIdx, outcome: 'ANY', minGoalDiff: 0 }], otherConstraints }];
  }

  // WIN + DRAW → DRAW_OR_WIN (only if win minGoalDiff ≤ 1)
  if (outcomes.has('WIN') && outcomes.has('DRAW') && !outcomes.has('LOSS')) {
    if ((minDiffByOutcome.get('WIN') ?? 0) <= 1) {
      return [{ ownConditions: [{ matchIdx, outcome: 'DRAW_OR_WIN', minGoalDiff: 0 }], otherConstraints }];
    }
  }

  // DRAW + LOSS → DRAW_OR_LOSS
  if (outcomes.has('DRAW') && outcomes.has('LOSS') && !outcomes.has('WIN')) {
    if ((minDiffByOutcome.get('LOSS') ?? 0) <= 1) {
      return [{ ownConditions: [{ matchIdx, outcome: 'DRAW_OR_LOSS', minGoalDiff: 0 }], otherConstraints }];
    }
  }

  // No merge — return ordered: WIN, DRAW, LOSS
  const order: TeamOutcome[] = ['WIN', 'DRAW', 'LOSS'];
  return order
    .filter(o => outcomes.has(o))
    .map(o => ({
      ownConditions: [{ matchIdx, outcome: o as ExtOutcome, minGoalDiff: minDiffByOutcome.get(o)! }],
      otherConstraints,
    }));
}

/** Factor tuples by one dimension, recursively merge remaining, then second-pass merge. */
function factorByDim(
  tuples: OwnTuple[],
  pivotDim: number,
  ownMatchIndices: number[],
  otherConstraints: Branch['otherConstraints'],
): Branch[] {
  // Group by pivot outcome
  const groups = new Map<TeamOutcome, OwnTuple[]>();
  for (const t of tuples) {
    const key = t.outcomes[pivotDim];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  // Remaining own-match indices (excluding pivot)
  const remainingIndices = ownMatchIndices.filter((_, i) => i !== pivotDim);

  // For each pivot group, recursively merge remaining dimensions
  interface AnnotatedBranch extends Branch {
    _pivotOutcome: TeamOutcome;
    _pivotMinDiff: number;
    _nonPivotKey: string;
  }

  const annotated: AnnotatedBranch[] = [];

  for (const [pivotOutcome, subTuples] of groups) {
    const pivotMinDiff = Math.min(...subTuples.map(t => t.minGoalDiffs[pivotDim]));

    // Remove pivot dimension from tuples
    const reducedTuples = deduplicateTuples(subTuples.map(t => ({
      outcomes: t.outcomes.filter((_, i) => i !== pivotDim),
      minGoalDiffs: t.minGoalDiffs.filter((_, i) => i !== pivotDim),
    })));

    // Recursively merge
    const subBranches = remainingIndices.length > 0
      ? mergeOwnTuples(reducedTuples, remainingIndices, otherConstraints)
      : [{ ownConditions: [] as Branch['ownConditions'], otherConstraints }];

    // Prepend pivot condition to each sub-branch
    for (const sb of subBranches) {
      const nonPivotKey = sb.ownConditions
        .map(c => `${c.matchIdx}:${c.outcome}:${c.minGoalDiff}`)
        .join('|');
      annotated.push({
        ownConditions: [
          { matchIdx: ownMatchIndices[pivotDim], outcome: pivotOutcome as ExtOutcome, minGoalDiff: pivotMinDiff },
          ...sb.ownConditions,
        ],
        otherConstraints,
        _pivotOutcome: pivotOutcome,
        _pivotMinDiff: pivotMinDiff,
        _nonPivotKey: nonPivotKey,
      });
    }
  }

  // Second pass: merge across pivot outcomes when non-pivot conditions match
  const nonPivotGroups = new Map<string, AnnotatedBranch[]>();
  for (const b of annotated) {
    if (!nonPivotGroups.has(b._nonPivotKey)) nonPivotGroups.set(b._nonPivotKey, []);
    nonPivotGroups.get(b._nonPivotKey)!.push(b);
  }

  const result: Branch[] = [];
  for (const group of nonPivotGroups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const pivotOutcomes = new Set(group.map(b => b._pivotOutcome));
    const merged = tryMergePivotOutcomes(pivotOutcomes, group);

    if (merged) {
      result.push({
        ownConditions: group[0].ownConditions.map(c =>
          c.matchIdx === ownMatchIndices[pivotDim]
            ? { ...c, outcome: merged.outcome, minGoalDiff: merged.minGoalDiff }
            : c
        ),
        otherConstraints,
      });
    } else {
      result.push(...group);
    }
  }

  return result;
}

function tryMergePivotOutcomes(
  outcomes: Set<TeamOutcome>,
  branches: { _pivotMinDiff: number; _pivotOutcome: TeamOutcome }[],
): { outcome: ExtOutcome; minGoalDiff: number } | null {
  if (outcomes.has('WIN') && outcomes.has('DRAW') && outcomes.has('LOSS')) {
    return { outcome: 'ANY', minGoalDiff: 0 };
  }
  if (outcomes.has('WIN') && outcomes.has('DRAW') && !outcomes.has('LOSS')) {
    const winMinDiff = Math.min(
      ...branches.filter(b => b._pivotOutcome === 'WIN').map(b => b._pivotMinDiff),
    );
    if (winMinDiff <= 1) {
      return { outcome: 'DRAW_OR_WIN', minGoalDiff: 0 };
    }
  }
  if (outcomes.has('DRAW') && outcomes.has('LOSS') && !outcomes.has('WIN')) {
    const lossMinDiff = Math.min(
      ...branches.filter(b => b._pivotOutcome === 'LOSS').map(b => b._pivotMinDiff),
    );
    if (lossMinDiff <= 1) {
      return { outcome: 'DRAW_OR_LOSS', minGoalDiff: 0 };
    }
  }
  return null;
}

function deduplicateTuples(tuples: OwnTuple[]): OwnTuple[] {
  const map = new Map<string, OwnTuple>();
  for (const t of tuples) {
    const key = t.outcomes.join('|');
    if (map.has(key)) {
      const existing = map.get(key)!;
      for (let i = 0; i < existing.minGoalDiffs.length; i++) {
        existing.minGoalDiffs[i] = Math.min(existing.minGoalDiffs[i], t.minGoalDiffs[i]);
      }
    } else {
      map.set(key, { outcomes: [...t.outcomes], minGoalDiffs: [...t.minGoalDiffs] });
    }
  }
  return Array.from(map.values());
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

    let isFirstOwn = true;
    for (const oc of b.ownConditions) {
      const m = remainingMatches[oc.matchIdx];
      const teamIsHome = m.homeTeamId === teamId;
      const opponent = teamIsHome ? m.awayTeamName : m.homeTeamName;
      const desc = describeOwnOutcome(oc.outcome, oc.minGoalDiff, teamName, opponent, isFirstOwn);
      if (desc) {
        conditions.push(desc);
        isFirstOwn = false;
      }
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
    return `<div class="scenario-path single">${capitalize(parts[0])}.</div>`;
  }

  // Multiple branches → numbered items with circle markers
  const items = parts.map((p, i) =>
    `<div class="scenario-path"><span class="scenario-path-num">${i + 1}</span><span class="scenario-path-text">${capitalize(p)}</span></div>`
  ).join('');
  return `<div class="scenario-paths">${items}</div>`;
}

function describeOwnOutcome(
  outcome: ExtOutcome,
  minGoalDiff: number,
  teamName: string,
  opponent: string,
  includeTeamName = true,
): string | null {
  const team = includeTeamName ? `<strong>${teamName}</strong> ` : '';
  const opp = `<strong>${opponent}</strong>`;

  switch (outcome) {
    case 'ANY':
      return null;
    case 'DRAW_OR_WIN':
      return `${team}at least draws with ${opp}`;
    case 'DRAW_OR_LOSS':
      return `${team}draws with or loses to ${opp}`;
    case 'WIN':
      if (minGoalDiff > 1) {
        return `${team}beats ${opp} by at least ${minGoalDiff} goals`;
      }
      return `${team}beats ${opp}`;
    case 'DRAW':
      return `${team}draws with ${opp}`;
    case 'LOSS':
      if (minGoalDiff > 1) {
        return `${team}loses to ${opp} by at least ${minGoalDiff} goals`;
      }
      return `${team}loses to ${opp}`;
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
