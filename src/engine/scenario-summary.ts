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

interface OtherConstraint {
  matchIdx: number;
  outcomes: Set<RawOutcome>;
  minGoalDiffs: Map<RawOutcome, number>;
}

interface Branch {
  ownConditions: { matchIdx: number; outcome: ExtOutcome; minGoalDiff: number }[];
  otherConstraints: OtherConstraint[];
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

  // Build branches — sub-group by own-match GD to preserve cross-match
  // GD dependencies (e.g. "loses by 4+ AND other team wins" vs
  // "loses by 1 AND other team wins by 3+").
  const branches: Branch[] = [];
  for (const [ownKey, groupEntries] of groups) {
    const ownOutcomes = ownKey.split('|') as TeamOutcome[];

    if (otherMatchIndices.length === 0) {
      // No other matches — just compute own conditions as before
      const ownConditions = ownOutcomes.map((outcome, i) => {
        const matchIdx = ownMatchIndices[i];
        const diffs = groupEntries.map(e => e[matchIdx].goalDiff);
        return { matchIdx, outcome: outcome as ExtOutcome, minGoalDiff: Math.min(...diffs) };
      });
      branches.push({ ownConditions, otherConstraints: [] });
      continue;
    }

    // Sub-group entries by own-match GD values
    const byOwnGD = new Map<string, MatchPatternEntry[][]>();
    for (const entries of groupEntries) {
      const gdKey = ownMatchIndices.map(i => entries[i].goalDiff).join(',');
      if (!byOwnGD.has(gdKey)) byOwnGD.set(gdKey, []);
      byOwnGD.get(gdKey)!.push(entries);
    }

    // For each own-GD sub-group, compute other constraints with minGoalDiffs
    interface SubBranch {
      ownGDs: number[][];
      otherConstraints: OtherConstraint[];
    }
    const subBranches: SubBranch[] = [];
    for (const [gdKey, subEntries] of byOwnGD) {
      const ownGDs = gdKey.split(',').map(Number);
      const oc: OtherConstraint[] = [];
      for (const idx of otherMatchIndices) {
        const outcomes = new Set<RawOutcome>();
        const minGDs = new Map<RawOutcome, number>();
        for (const e of subEntries) {
          const raw = e[idx].rawOutcome;
          const gd = e[idx].goalDiff;
          outcomes.add(raw);
          const curr = minGDs.get(raw);
          minGDs.set(raw, curr !== undefined ? Math.min(curr, gd) : gd);
        }
        oc.push({ matchIdx: idx, outcomes, minGoalDiffs: minGDs });
      }
      subBranches.push({ ownGDs: [ownGDs], otherConstraints: oc });
    }

    // Merge sub-branches with identical other constraints
    const mergedSubs: SubBranch[] = [];
    for (const sb of subBranches) {
      const match = mergedSubs.find(m => otherConstraintsEqual(m.otherConstraints, sb.otherConstraints));
      if (match) {
        match.ownGDs.push(...sb.ownGDs);
      } else {
        mergedSubs.push({ ownGDs: [...sb.ownGDs], otherConstraints: sb.otherConstraints });
      }
    }

    // Convert to branches
    for (const { ownGDs, otherConstraints } of mergedSubs) {
      const ownConditions = ownOutcomes.map((outcome, dimIdx) => {
        const matchIdx = ownMatchIndices[dimIdx];
        const minGoalDiff = Math.min(...ownGDs.map(gds => gds[dimIdx]));
        return { matchIdx, outcome: outcome as ExtOutcome, minGoalDiff };
      });
      branches.push({ ownConditions, otherConstraints });
    }
  }

  // Merge branches
  const merged = mergeBranches(branches, ownMatchIndices, otherMatchIndices);

  // Remove branches fully subsumed by a wider branch
  const deduped = removeRedundantBranches(merged);

  if (deduped.length > 5) {
    return 'Multiple scenarios possible — see details below.';
  }

  return buildSentence(deduped, remainingMatches, teamId, teamName);
}

// ============================================================
// Redundancy removal
// ============================================================

/**
 * Remove branches that are fully subsumed by a wider branch.
 * E.g., if branch A says "draws or loses (any)" and branch B says
 * "loses by 4+ (BIH draws or loses)", B is redundant since A covers it.
 */
function removeRedundantBranches(branches: Branch[]): Branch[] {
  return branches.filter(b =>
    !branches.some(a => a !== b && branchSubsumes(a, b))
  );
}

function branchSubsumes(a: Branch, b: Branch): boolean {
  if (a.ownConditions.length !== b.ownConditions.length) return false;
  if (a.otherConstraints.length !== b.otherConstraints.length) return false;

  let strictlyWider = false;

  for (let i = 0; i < a.ownConditions.length; i++) {
    const ao = a.ownConditions[i], bo = b.ownConditions[i];
    if (ao.matchIdx !== bo.matchIdx) return false;
    if (!outcomeIncludes(ao.outcome, bo.outcome)) return false;
    if (ao.minGoalDiff > bo.minGoalDiff) return false;
    if (ao.outcome !== bo.outcome || ao.minGoalDiff < bo.minGoalDiff) strictlyWider = true;
  }

  for (let i = 0; i < a.otherConstraints.length; i++) {
    for (const outcome of b.otherConstraints[i].outcomes) {
      if (!a.otherConstraints[i].outcomes.has(outcome)) return false;
    }
    if (a.otherConstraints[i].outcomes.size > b.otherConstraints[i].outcomes.size) strictlyWider = true;
    for (const [outcome, bGD] of b.otherConstraints[i].minGoalDiffs) {
      const aGD = a.otherConstraints[i].minGoalDiffs.get(outcome);
      if (aGD !== undefined && aGD > bGD) return false;
      if (aGD !== undefined && aGD < bGD) strictlyWider = true;
    }
  }

  return strictlyWider;
}

function outcomeIncludes(a: ExtOutcome, b: ExtOutcome): boolean {
  if (a === b) return true;
  if (a === 'ANY') return true;
  if (a === 'DRAW_OR_WIN') return b === 'DRAW' || b === 'WIN';
  if (a === 'DRAW_OR_LOSS') return b === 'DRAW' || b === 'LOSS';
  return false;
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

  // Group branches by their other constraints so the merge logic
  // (which assumes at most one branch per own-outcome type) works correctly
  // even when sub-grouping produces multiple branches of the same outcome type.
  const constraintGroups = new Map<string, Branch[]>();
  for (const b of branches) {
    const key = otherConstraintFingerprint(b.otherConstraints);
    if (!constraintGroups.has(key)) constraintGroups.set(key, []);
    constraintGroups.get(key)!.push(b);
  }

  const result: Branch[] = [];
  for (const group of constraintGroups.values()) {
    if (ownMatchIndices.length === 1) {
      result.push(...mergeSingleOwnMatch(group, otherMatchIndices));
    } else {
      result.push(...mergeMultiOwnMatches(group, ownMatchIndices, otherMatchIndices));
    }
  }
  return result;
}

function otherConstraintFingerprint(oc: OtherConstraint[]): string {
  return oc.map(c => {
    const outcomeEntries = Array.from(c.outcomes).sort().map(o => {
      const gd = c.minGoalDiffs.get(o) ?? 0;
      return `${o}${gd}`;
    }).join(',');
    return `${c.matchIdx}:${outcomeEntries}`;
  }).join('|');
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
  return otherConstraintFingerprint(b.otherConstraints);
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

function otherConstraintsEqual(
  a: OtherConstraint[],
  b: OtherConstraint[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].outcomes.size !== b[i].outcomes.size) return false;
    for (const v of a[i].outcomes) {
      if (!b[i].outcomes.has(v)) return false;
    }
    // Compare minGoalDiffs
    for (const [outcome, gd] of a[i].minGoalDiffs) {
      if (b[i].minGoalDiffs.get(outcome) !== gd) return false;
    }
    for (const [outcome] of b[i].minGoalDiffs) {
      if (!a[i].minGoalDiffs.has(outcome)) return false;
    }
  }
  return true;
}

function sameOtherConstraints(a: Branch, b: Branch): boolean {
  return otherConstraintsEqual(a.otherConstraints, b.otherConstraints);
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
      const desc = describeOtherOutcome(oc.outcomes, m.homeTeamName, m.awayTeamName, oc.minGoalDiffs);
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
  minGoalDiffs?: Map<RawOutcome, number>,
): string | null {
  if (outcomes.size === 3) return null;

  const home = `<strong>${homeName}</strong>`;
  const away = `<strong>${awayName}</strong>`;

  if (outcomes.size === 1) {
    const o = outcomes.values().next().value;
    const minGD = minGoalDiffs?.get(o as RawOutcome) ?? 1;
    if (o === 'H') {
      if (minGD > 1) return `${home} beats ${away} by at least ${minGD} goals`;
      return `${home} beats ${away}`;
    }
    if (o === 'A') {
      if (minGD > 1) return `${away} beats ${home} by at least ${minGD} goals`;
      return `${away} beats ${home}`;
    }
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
