/**
 * AI-powered scenario summary generation using Claude API.
 *
 * Sends all computed outcome patterns (edge conditions) to Claude
 * and gets back a punchy, readable English interpretation of what
 * a team needs to qualify — or what would knock them out.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query } from '../lib/db';
import { withClaudeSlot } from '../lib/claude-concurrency';
import { isFeatureEnabled, isAiGenerationEnabledByEnv } from '../lib/feature-flags';
import { getAiPredictionModelId } from '../lib/ai-model-server';
import { RemainingMatchInfo } from './scenario-summary';
import type { MatchCombination } from './scenarios';

// maxRetries lets the SDK ride through 429s honoring the retry-after header.
// A 429 is rejected BEFORE generation, so retrying it bills nothing.
const client = new Anthropic({ maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES) || 4 });

const SYSTEM_PROMPT = `You are a football (soccer) analyst for a World Cup prediction website. For ONE team you are given, for EACH of several finishing positions (1st/2nd/3rd/4th), the complete set of result combinations that lead there. Write one short summary per requested position.

EACH SUMMARY:
1. First sentence — the shortest possible verdict (what must happen). E.g. "A win against Japan is enough." / "Mexico needs to beat South Korea and hope Czech Republic draws or loses." / "Already safe — any result will do." / "Only a very specific combination of results can save them."
2. Second sentence — probability context: likely, possible, or a long shot, and how it compares to the other positions.
3. Then cover ALL remaining outcome combinations — every distinct path in the data, even unlikely ones. Use the PRE-COMPUTED PATHS exactly; never reinterpret the raw patterns.

LENGTH & STYLE (per summary): 3–8 sentences, in short paragraphs of at most 2 sentences. Very simple English for non-native readers — short sentences, common words, active voice, no idioms/slang, no filler, no labels ("In short:", "Bottom line:"). NEVER use negations: write "wins or draws", not "does not lose".

CONTENT:
- State minimum goal margins when a combination needs one ("by X+ goals") — these edge cases are the interesting part.
- SIMPLIFY AGGRESSIVELY: if all combinations share one condition for this team (e.g. it loses in all of them), state just that and add "regardless of the other result" — do NOT list the other match per variant. Only mention the other match when its result actually changes the outcome. Never produce numbered paths that differ only in an irrelevant match result — merge them.
- ACCURACY IS PARAMOUNT: before any general claim ("must win", "needs to beat X"), verify it against EVERY combination; if even one contradicts it, do not make it. Use ONLY the data given; never invent. If a team qualifies or is eliminated no matter what, say so. When another match matters, name it.
- Real team names, never IDs. All matches are at neutral venues — never "home"/"away"; say "plays"/"faces". Position meanings: 1st = group winner, 2nd = runner-up (both auto-qualify), 3rd = may qualify as a best third-placed team, 4th = eliminated.

TIEBREAKERS (critical — positions are NOT decided by points alone). When teams finish level on points the order is: (1) overall goal difference; (2) overall goals scored; (3) head-to-head among only the tied teams (their points, then goal difference, then goals scored in the matches between them); (4) fair play; (5) FIFA ranking. The "Results so far" and the goals-scored figures are given so you can EXPLAIN these — never to re-derive positions yourself.
- Goal margins are load-bearing. A required "by X+ goals" exists because a smaller result fails a tiebreaker; keep the margin in the verdict AND in every path that needs it, and never drop or round it when simplifying. "beats X" and "beats X by 2+ goals" are different claims.
- Each summary covers ONLY the combinations that put this team in THAT position. Never narrate a counterfactual that would land the team in a DIFFERENT position. In particular, do NOT justify a margin at a higher position by describing the worse outcome it avoids — at 1st place simply state the margin needed to finish 1st; the case where a smaller margin drops the team to 2nd belongs in the 2nd-place summary, not the 1st.
- Explain a tiebreaker in the summary of the position the team ACTUALLY REACHES through it. When a listed path leaves this team level on points with a rival and a tiebreaker settles the order, name the tiebreaker and who is ahead, using the locked facts — e.g. in the 2nd-place summary: "Czech Republic beats Mexico by a single goal here, finishing level with South Korea on points and goal difference; South Korea places above because it won their head-to-head 2-1." Results in "Results so far" are locked and cannot change.
- GROUND TRUTH: the PRE-COMPUTED PATHS and their goal margins are the only source of truth for WHAT must happen and for WHICH position each combination gives. Use standings / "Results so far" / goals-scored ONLY to explain WHY — never to infer, add, change, or re-rank a result.

OUTPUT — for EACH requested position write a delimiter line exactly "===POSITION N===" (N = the position number) on its own line, then that position's summary HTML on the following line(s). No JSON, no markdown fences, no commentary. The HTML may contain double quotes freely. Example:
===POSITION 1===
<p>...</p><div class="scenario-paths">...</div>
===POSITION 3===
<div class="scenario-path single">...</div>

HTML for each position:
- Lead with the verdict + probability context as one or two short <p>…</p> paragraphs. Wrap a team or opponent name in <strong> on first mention (inline, never on its own line).
- For multiple distinct paths, append numbered items:
  <div class="scenario-paths"><div class="scenario-path"><span class="scenario-path-num">1</span><span class="scenario-path-text">Path (1–2 sentences max)</span></div><div class="scenario-path"><span class="scenario-path-num">2</span><span class="scenario-path-text">Path (1–2 sentences max)</span></div></div>
- For a single path: <div class="scenario-path single">Description.</div>
- No tags other than <p>, <strong>, and the scenario-path divs/spans shown above.`;

export interface AiUsageStats {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/** Shared (per-team) context for a batched scenario-summary call. */
interface BatchSharedContext {
  teamId: number;
  teamName: string;
  groupId: string;
  allProbabilities: { [pos: number]: number };
  remainingMatches: { homeTeam: string; awayTeam: string; isTeamMatch: boolean }[];
  currentStandings: { teamName: string; points: number; gd: number; goalsFor?: number; position: number }[];
  /** Finished group matches with scores — the locked head-to-head record the
   *  model needs to EXPLAIN tiebreakers (e.g. "South Korea beat them 2-1"). */
  playedMatches?: { homeTeam: string; awayTeam: string; homeGoals: number; awayGoals: number }[];
}

/** One finishing position to summarise. */
interface PositionTask {
  position: number;
  probability: number;
  outcomePatterns: string[];
}

interface BatchResult {
  byPosition: { [pos: number]: string };
  /** The model's raw text output, kept for diagnostics when parsing comes up
   *  short (e.g. a malformed delimiter or truncated response). */
  raw: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The per-position data block: reduced outcome combinations + the pre-computed
 * own-match/other-match paths. Shared context (team, standings, remaining
 * matches, probabilities) is emitted once by the caller, not per position.
 */
function buildPositionBlock(
  task: PositionTask,
  teamName: string,
  remainingMatches: { homeTeam: string; awayTeam: string; isTeamMatch: boolean }[],
): string {
  const { text: patternExplanation, reducedCount } = reduceAndDecodePatterns(task.outcomePatterns, remainingMatches);

  // Pre-analyse own-match outcomes, grouping other-match conditions by own
  // outcome, so the model gets a clear structure it can't misread.
  let preComputedPaths = '';
  const ownMatchIdx = remainingMatches.findIndex(m => m.isTeamMatch);
  if (ownMatchIdx >= 0) {
    const ownMatch = remainingMatches[ownMatchIdx];
    const teamIsHome = ownMatch.homeTeam === teamName;
    const winLetter = teamIsHome ? 'H' : 'A';
    const opponent = teamIsHome ? ownMatch.awayTeam : ownMatch.homeTeam;
    const otherMatches = remainingMatches.filter((_, i) => i !== ownMatchIdx);

    const grouped: Record<string, Set<string>> = {};
    for (const pattern of task.outcomePatterns) {
      const parts = pattern.split('|');
      const ownLetter = parts[ownMatchIdx]?.charAt(0);
      const ownLabel = ownLetter === winLetter ? 'WIN' : ownLetter === 'D' ? 'DRAW' : 'LOSS';
      if (!grouped[ownLabel]) grouped[ownLabel] = new Set();
      const otherParts = parts.filter((_, i) => i !== ownMatchIdx);
      const otherDesc = otherParts.map((p, i) => {
        const m = otherMatches[i];
        if (!m) return p;
        const letter = p.charAt(0);
        const gd = parseInt(p.slice(1), 10) || 0;
        const gdNote = letter !== 'D' && gd > 1 ? ` by ${gd}+ goals` : '';
        if (letter === 'H') return `${m.homeTeam} beats ${m.awayTeam}${gdNote}`;
        if (letter === 'A') return `${m.awayTeam} beats ${m.homeTeam}${gdNote}`;
        return `${m.homeTeam} draws with ${m.awayTeam}`;
      }).join(', ');
      grouped[ownLabel].add(otherDesc);
    }

    const pathLines: string[] = [];
    for (const [outcome, conditions] of Object.entries(grouped)) {
      const condArray = [...conditions];
      const verb = outcome === 'WIN' ? `beats ${opponent}` : outcome === 'DRAW' ? `draws with ${opponent}` : `loses to ${opponent}`;
      if (otherMatches.length === 0) {
        pathLines.push(`    ${outcome}: ${teamName} ${verb} → reaches this position`);
      } else {
        pathLines.push(`    ${outcome}: ${teamName} ${verb}, and: ${condArray.join(' OR ')}`);
      }
    }
    preComputedPaths = `\n  PRE-COMPUTED PATHS (use these EXACTLY — do not reinterpret the raw patterns):\n${pathLines.join('\n')}`;
    if (grouped['LOSS']) {
      preComputedPaths += `\n  ⚠️ ${teamName} CAN reach this position even when LOSING — include this as a numbered path.`;
    }
  }

  return `Position ${task.position}${posLabel(task.position)} — probability ${task.probability.toFixed(1)}%
  ${reducedCount} distinct outcome combinations (reduced from ${task.outcomePatterns.length} goal-difference variants), with minimum goal differences where relevant:
${patternExplanation}${preComputedPaths}`;
}

/**
 * Parse the batched response. Sections are delimited by `===POSITION N===`
 * lines, the HTML follows until the next delimiter. A delimiter format (not
 * JSON) is used deliberately: the HTML values contain double quotes
 * (class="scenario-paths") which models routinely fail to escape inside a JSON
 * string, silently producing invalid JSON. Here the HTML needs no escaping.
 */
function parseBatchResponse(raw: string): { [pos: number]: string } {
  const out: { [pos: number]: string } = {};
  // Split on the delimiter, capturing the position number. parts = [preamble,
  // posNum, content, posNum, content, ...].
  const parts = raw.split(/===\s*POSITION\s*(\d)\s*===/i);
  for (let i = 1; i < parts.length; i += 2) {
    const pos = Number(parts[i]);
    let content = (parts[i + 1] ?? '').trim();
    // Strip stray markdown fences the model may wrap around the HTML.
    content = content.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (pos >= 1 && pos <= 4 && content) out[pos] = content;
  }
  return out;
}

/**
 * Generate scenario summaries for SEVERAL positions of one team in a SINGLE
 * Claude call. Batching collapses the per-position fan-out (was up to 4
 * calls/team, 16/group) to one call/team — the big system prompt is sent once
 * instead of per position, which was the dominant scenario-input cost.
 */
async function generateAiSummariesBatch(
  shared: BatchSharedContext,
  tasks: PositionTask[],
): Promise<BatchResult> {
  const matchList = shared.remainingMatches
    .map((m, i) => `  Match ${i}: ${m.homeTeam} vs ${m.awayTeam}${m.isTeamMatch ? ' (team\'s own match)' : ''}`)
    .join('\n');

  const standingsContext = shared.currentStandings
    .map(s => {
      const gf = s.goalsFor !== undefined ? `, ${s.goalsFor} goals scored` : '';
      return `  ${s.position}. ${s.teamName} — ${s.points} pts, GD ${s.gd >= 0 ? '+' : ''}${s.gd}${gf}`;
    })
    .join('\n');

  // Locked head-to-head record. Tiebreakers can hinge on an already-played
  // result, so list finished matches with scores; the model uses them only to
  // EXPLAIN why a margin/tiebreaker matters (see system prompt).
  const resultsContext = (shared.playedMatches ?? [])
    .map(m => `  ${m.homeTeam} ${m.homeGoals}-${m.awayGoals} ${m.awayTeam}`)
    .join('\n');

  const probLines = [1, 2, 3, 4]
    .filter(p => (shared.allProbabilities[p] ?? 0) > 0)
    .map(p => `  ${p}${posLabel(p)}: ${(shared.allProbabilities[p] ?? 0).toFixed(1)}%`)
    .join('\n');

  const positionBlocks = tasks
    .map(t => buildPositionBlock(t, shared.teamName, shared.remainingMatches))
    .join('\n\n');

  const requested = tasks.map(t => t.position).join(', ');

  const userPrompt = `Team: ${shared.teamName} (Group ${shared.groupId})

All position probabilities for ${shared.teamName}:
${probLines}

Current standings (points, goal difference, goals scored):
${standingsContext}
${resultsContext ? `\nResults so far (locked — these decide head-to-head tiebreakers):\n${resultsContext}\n` : ''}
Remaining matches in the group:
${matchList}

Write a scenario summary for EACH of these finishing positions: ${requested}. Output each one under its "===POSITION N===" delimiter line as described.

${positionBlocks}`;

  const modelId = await getAiPredictionModelId();
  const response = await withClaudeSlot(() => withTimeout(client.messages.create({
    model: modelId,
    max_tokens: Math.min(640 * tasks.length, 2048),
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  }), AI_CALL_TIMEOUT_MS));

  const raw = response.content.find(b => b.type === 'text')?.text ?? '';
  const byPosition = parseBatchResponse(raw);
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  // Make parse outcomes visible in the log — a silent partial/empty parse was
  // exactly what hid the JSON-escaping bug. On a shortfall, dump the raw output.
  const requestedPositions = tasks.map(t => t.position);
  const got = Object.keys(byPosition).map(Number).sort((a, b) => a - b);
  const missing = requestedPositions.filter(p => !got.includes(p));
  const stopReason = response.stop_reason ?? 'unknown';
  if (missing.length > 0) {
    console.error(
      `[scenario-batch] ${shared.teamName}: requested [${requestedPositions.join(',')}] but parsed only [${got.join(',')}] — MISSING [${missing.join(',')}] · stop=${stopReason} · ${inputTokens} in / ${outputTokens} out\n` +
      `[scenario-batch] raw model output (first 1000 chars):\n${raw.slice(0, 1000)}`,
    );
  } else {
    console.log(`[scenario-batch] ${shared.teamName}: ok [${got.join(',')}] · stop=${stopReason} · ${inputTokens} in / ${outputTokens} out`);
  }

  return { byPosition, raw, inputTokens, outputTokens };
}

function posLabel(pos: number): string {
  switch (pos) {
    case 1: return 'st (group winner)';
    case 2: return 'nd (runner-up)';
    case 3: return 'rd (best-third dependent)';
    case 4: return 'th (eliminated)';
    default: return '';
  }
}

/**
 * Reduce outcome patterns to unique W/D/L combinations with min goal-difference
 * thresholds, producing a concise prompt instead of hundreds of GD variants.
 *
 * Patterns use format: outcome+GD for ALL matches (e.g. "H3|H1").
 * Sub-groups by own-match GD to preserve cross-match dependencies
 * (e.g. "team loses by 4+ AND other wins" vs "team loses by 1 AND other wins by 3+").
 */
function reduceAndDecodePatterns(
  patterns: string[],
  matches: { homeTeam: string; awayTeam: string; isTeamMatch: boolean }[],
): { text: string; reducedCount: number } {
  const ownIndices = matches.map((m, i) => m.isTeamMatch ? i : -1).filter(i => i >= 0);
  const otherIndices = matches.map((m, i) => !m.isTeamMatch ? i : -1).filter(i => i >= 0);

  // Group by outcome-only key (strip GD numbers)
  const outcomeGroups = new Map<string, number[][]>();
  for (const pattern of patterns) {
    const parts = pattern.split('|');
    const outcomeKey = parts.map(p => p.charAt(0)).join('|');
    const gds = parts.map(p => parseInt(p.slice(1), 10) || 0);
    if (!outcomeGroups.has(outcomeKey)) outcomeGroups.set(outcomeKey, []);
    outcomeGroups.get(outcomeKey)!.push(gds);
  }

  const lines: string[] = [];

  for (const [outcomeKey, allGDs] of outcomeGroups) {
    const outcomes = outcomeKey.split('|');

    if (otherIndices.length === 0) {
      // No other matches — simple min-GD across all entries
      const minGDs = allGDs[0].map((_, i) => Math.min(...allGDs.map(g => g[i])));
      lines.push(formatPatternLine(outcomes, minGDs, matches, allGDs.length));
      continue;
    }

    // Sub-group by own-match GD values to preserve cross-match constraints
    const byOwnGD = new Map<string, number[][]>();
    for (const gds of allGDs) {
      const key = ownIndices.map(i => gds[i]).join(',');
      if (!byOwnGD.has(key)) byOwnGD.set(key, []);
      byOwnGD.get(key)!.push(gds);
    }

    // For each sub-group, compute min other-match GDs, then merge sub-groups
    // with identical other-match constraints
    interface SubGroup {
      ownGDsList: number[][];
      otherMinGDs: number[];
      count: number;
    }
    const merged: SubGroup[] = [];
    for (const [ownKey, subGDs] of byOwnGD) {
      const ownGDs = ownKey.split(',').map(Number);
      const otherMinGDs = otherIndices.map(i => Math.min(...subGDs.map(g => g[i])));
      const match = merged.find(m => m.otherMinGDs.every((v, i) => v === otherMinGDs[i]));
      if (match) {
        match.ownGDsList.push(ownGDs);
        match.count += subGDs.length;
      } else {
        merged.push({ ownGDsList: [ownGDs], otherMinGDs, count: subGDs.length });
      }
    }

    // Generate a line for each merged sub-group
    for (const { ownGDsList, otherMinGDs, count } of merged) {
      const minGDs = matches.map((_, i) => {
        const ownIdx = ownIndices.indexOf(i);
        if (ownIdx >= 0) return Math.min(...ownGDsList.map(g => g[ownIdx]));
        const otherIdx = otherIndices.indexOf(i);
        return otherIdx >= 0 ? otherMinGDs[otherIdx] : 0;
      });
      lines.push(formatPatternLine(outcomes, minGDs, matches, count));
    }
  }

  return { text: lines.join('\n'), reducedCount: lines.length };
}

function formatPatternLine(
  outcomes: string[],
  minGDs: number[],
  matches: { homeTeam: string; awayTeam: string; isTeamMatch: boolean }[],
  count: number,
): string {
  const decoded = outcomes.map((o, i) => {
    const m = matches[i];
    if (!m) return o;
    const gd = minGDs[i];
    const gdNote = o !== 'D' && gd > 1 ? ` by ${gd}+ goals` : '';
    if (o === 'H') return `${m.homeTeam} beats ${m.awayTeam}${gdNote}`;
    if (o === 'A') return `${m.awayTeam} beats ${m.homeTeam}${gdNote}`;
    return `${m.homeTeam} draws with ${m.awayTeam}`;
  });
  const variants = count > 1 ? ` [${count} GD variants]` : '';
  return `  ${decoded.join(', ')}${variants}`;
}

// ============================================================
// Cache layer — store AI summaries in PostgreSQL
// ============================================================

interface AiSummaryCacheRow {
  group_id: string;
  team_id: number;
  position: number;
  summary_html: string;
  patterns_hash: string;
  created_at: string;
}

/**
 * Simple hash of outcome patterns to detect when scenarios change.
 */
function hashPatterns(patterns: string[]): string {
  // Sort for determinism, then create a simple hash
  // Version salt — bump to invalidate all cached summaries after prompt changes
  const sorted = [...patterns].sort();
  let hash = 0;
  // v8: the prompt now carries goals-scored, the locked "Results so far" record
  // and explicit tiebreaker rules so the model explains required goal margins
  // (head-to-head / goals scored) instead of stating them bare. Bump
  // regenerates cached summaries under the new input.
  const str = 'v8:' + sorted.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Get cached AI summary if patterns haven't changed.
 */
async function getCachedAiSummary(
  groupId: string,
  teamId: number,
  position: number,
  patternsHash: string,
): Promise<string | null> {
  const rows = await query<AiSummaryCacheRow>(
    'SELECT * FROM ai_summary_cache WHERE group_id = $1 AND team_id = $2 AND position = $3 AND patterns_hash = $4',
    [groupId, teamId, position, patternsHash],
  );
  return rows.length > 0 ? rows[0].summary_html : null;
}

/**
 * Save AI summary to cache.
 */
async function saveAiSummary(
  groupId: string,
  teamId: number,
  position: number,
  summaryHtml: string,
  patternsHash: string,
): Promise<void> {
  await query(
    `INSERT INTO ai_summary_cache (group_id, team_id, position, summary_html, patterns_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_id, team_id, position)
     DO UPDATE SET summary_html = $4, patterns_hash = $5, created_at = NOW()`,
    [groupId, teamId, position, summaryHtml, patternsHash],
  );
}

// ============================================================
// Public API
// ============================================================

export interface AiSummaryContext {
  teamId: number;
  teamName: string;
  groupId: string;
  /** The deduplicated, capped edge scenarios per position — the SAME reduced
   *  set shown on the site (≤50), NOT the full combinatorial enumeration. We
   *  feed the model only these; the full enumeration could run to ~10k patterns
   *  per position and overflow the context window. */
  edgeScenariosByPosition: { [pos: number]: MatchCombination[] };
  probabilities: { [pos: number]: number };
  remainingMatches: RemainingMatchInfo[];
  currentStandings: { teamName: string; points: number; gd: number; goalsFor?: number; position: number }[];
  /** Finished group matches with scores (locked head-to-head record). Only the
   *  generation path needs these; cache-only read paths may omit them. */
  playedMatches?: { homeTeam: string; awayTeam: string; homeGoals: number; awayGoals: number }[];
}

/** Convert edge scenarios into the outcome+GD pattern strings the summariser
 *  consumes ("H3|D0|A2"), preserving the remaining-match order. */
function edgePatterns(edges: MatchCombination[]): string[] {
  return edges.map(e =>
    e.matchResults.map(r => `${r.shortResult}${Math.abs(r.homeGoals - r.awayGoals)}`).join('|'),
  );
}

/**
 * Generate AI summaries for all positions of a team.
 * Uses cache when available; calls Claude API only when patterns change.
 *
 * Returns { [pos]: htmlString } — same shape as generateScenarioSummaries().
 */
/** Wrap a promise with a timeout (ms). Rejects if the promise doesn't resolve in time. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Per-position timeout for Claude API call. Overridable via env (slow lane). */
const AI_CALL_TIMEOUT_MS = Number(process.env.AI_CALL_TIMEOUT_MS) || 15_000;

/**
 * Read-only variant: returns cached AI summaries only, NEVER calls the Claude API.
 * Use this from page renders where a cache miss must not trigger generation.
 * Fresh generation is the job of the admin match-update pregeneration path.
 */
export async function getCachedAiScenarioSummaries(
  ctx: AiSummaryContext,
): Promise<{ [pos: number]: string }> {
  const result: { [pos: number]: string } = {};

  for (let pos = 1; pos <= 4; pos++) {
    const prob = ctx.probabilities[pos] ?? 0;
    if (prob === 0) continue;
    if (prob === 100) {
      result[pos] = '<div class="scenario-path single">Guaranteed.</div>';
      continue;
    }

    const patterns = edgePatterns(ctx.edgeScenariosByPosition[pos] ?? []);
    if (patterns.length === 0) continue;

    const pHash = hashPatterns(patterns);
    try {
      const cached = await getCachedAiSummary(ctx.groupId, ctx.teamId, pos, pHash);
      if (cached) result[pos] = cached;
    } catch {
      // Cache table missing or unreachable — silently skip, deterministic fallback will be used
    }
  }

  return result;
}

/** Per-batched-call diagnostics, so callers can surface generation shortfalls
 *  (which positions the model returned vs were requested, plus a raw snippet)
 *  in the admin diagnostic e-mail — not just the scraper log. */
export interface ScenarioBatchDiagnostic {
  teamName: string;
  requested: number[];
  parsed: number[];
  missing: number[];
  stopReason: string;
  rawSnippet: string;
}

export interface GenerateAiSummariesOptions {
  /** When true, skip cache lookup and regenerate every position. */
  force?: boolean;
  /** When true, bypass the env kill-switch + DB feature flag (superadmin path). */
  ignoreFlags?: boolean;
  /** Usage accumulator — totals are added to this object across all calls. */
  usage?: AiUsageStats;
  /** When provided, each batched call appends its parse outcome here. */
  diagnostics?: ScenarioBatchDiagnostic[];
}

export async function generateAiScenarioSummaries(
  ctx: AiSummaryContext,
  options: GenerateAiSummariesOptions = {},
): Promise<{ [pos: number]: string }> {
  const result: { [pos: number]: string } = {};

  const remainingMatchesForPrompt = ctx.remainingMatches.map(m => ({
    homeTeam: m.homeTeamName,
    awayTeam: m.awayTeamName,
    isTeamMatch: m.homeTeamId === ctx.teamId || m.awayTeamId === ctx.teamId,
  }));

  // Build tasks for positions that need AI generation
  const tasks: { pos: number; patterns: string[]; pHash: string }[] = [];

  for (let pos = 1; pos <= 4; pos++) {
    const prob = ctx.probabilities[pos] ?? 0;
    if (prob === 0) continue;
    if (prob === 100) {
      result[pos] = '<div class="scenario-path single">Guaranteed.</div>';
      continue;
    }

    const patterns = edgePatterns(ctx.edgeScenariosByPosition[pos] ?? []);
    if (patterns.length === 0) continue;

    const pHash = hashPatterns(patterns);

    // Try cache first (unless force-regen)
    if (!options.force) {
      try {
        const cached = await getCachedAiSummary(ctx.groupId, ctx.teamId, pos, pHash);
        if (cached) {
          result[pos] = cached;
          continue;
        }
      } catch {
        // Cache table might not exist yet — will generate fresh
      }
    }

    tasks.push({ pos, patterns, pHash });
  }

  if (tasks.length === 0) return result;

  // Feature flag: when AI predictions are disabled we still serve any cached
  // summaries found above, but skip fresh Claude calls entirely.
  // Superadmin force-regen path bypasses both gates via options.ignoreFlags.
  if (!options.ignoreFlags) {
    if (!isAiGenerationEnabledByEnv()) return result;
    const aiEnabled = await isFeatureEnabled('ai_predictions', true);
    if (!aiEnabled) return result;
  }

  const shared: BatchSharedContext = {
    teamId: ctx.teamId,
    teamName: ctx.teamName,
    groupId: ctx.groupId,
    allProbabilities: ctx.probabilities,
    remainingMatches: remainingMatchesForPrompt,
    currentStandings: ctx.currentStandings,
    playedMatches: ctx.playedMatches,
  };

  // Group the uncached positions into size-bounded chunks. Batching the system
  // prompt across positions is the cost win, BUT early in a group a single
  // position (especially 3rd) can carry a huge number of outcome combinations —
  // packing all four into one prompt blew past the 200k-token context window.
  // So we greedily pack positions into chunks under a char budget: small
  // positions batch together; an oversized one goes alone (same as the old
  // per-position call, which always fit).
  const MAX_CHUNK_CHARS = 250_000;
  const sized = tasks.map(t => ({
    task: t,
    blockLen: buildPositionBlock(
      { position: t.pos, probability: ctx.probabilities[t.pos] ?? 0, outcomePatterns: t.patterns },
      ctx.teamName,
      remainingMatchesForPrompt,
    ).length,
  }));
  const chunks: typeof tasks[] = [];
  let current: typeof tasks = [];
  let currentLen = 0;
  for (const { task, blockLen } of sized) {
    if (current.length > 0 && currentLen + blockLen > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(task);
    currentLen += blockLen;
  }
  if (current.length > 0) chunks.push(current);

  for (const chunk of chunks) {
    try {
      const batch = await generateAiSummariesBatch(
        shared,
        chunk.map(t => ({
          position: t.pos,
          probability: ctx.probabilities[t.pos] ?? 0,
          outcomePatterns: t.patterns,
        })),
      );

      if (options.usage) {
        options.usage.calls += 1;
        options.usage.inputTokens += batch.inputTokens;
        options.usage.outputTokens += batch.outputTokens;
      }

      if (options.diagnostics) {
        const requested = chunk.map(t => t.pos);
        const parsed = Object.keys(batch.byPosition).map(Number).sort((a, b) => a - b);
        const missing = requested.filter(p => !parsed.includes(p));
        options.diagnostics.push({
          teamName: ctx.teamName,
          requested,
          parsed,
          missing,
          stopReason: '', // (the per-call stop reason is in the log)
          rawSnippet: missing.length > 0 ? batch.raw.slice(0, 1200) : '',
        });
      }

      // Distribute results back per position and cache each (best-effort) so the
      // per-position cache granularity is preserved.
      for (const task of chunk) {
        const text = batch.byPosition[task.pos];
        if (text) {
          result[task.pos] = text;
          try {
            await saveAiSummary(ctx.groupId, ctx.teamId, task.pos, text, task.pHash);
          } catch {
            // Cache write failure is non-fatal
          }
        }
      }
    } catch (err) {
      console.error(`AI scenario summaries batch failed for ${ctx.teamName} (positions ${chunk.map(t => t.pos).join(',')}):`, err);
    }
  }

  return result;
}
