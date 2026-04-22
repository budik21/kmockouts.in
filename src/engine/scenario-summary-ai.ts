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
import { isFeatureEnabled } from '../lib/feature-flags';
import { RemainingMatchInfo } from './scenario-summary';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a football (soccer) analyst writing for a World Cup prediction website.

Your job: given a team's computed qualification scenarios, write a clear summary of what the team needs.

STRUCTURE — VERY IMPORTANT:
1. FIRST SENTENCE: Start with the shortest possible verdict. One sentence that tells the reader what must happen. Examples:
   - "A win against Japan is enough."
   - "Mexico needs to beat South Korea and hope Czech Republic draws or loses."
   - "Only a very specific combination of results can save them."
   - "Already safe — any result will do."
2. SECOND SENTENCE: Probability context — is this likely or unlikely? Compare to other positions. One sentence only.
3. THEN: Cover ALL remaining outcome combinations. Every distinct path in the data must be mentioned — do not skip any, even unlikely ones.

LENGTH — VERY IMPORTANT:
- The TOTAL output must be 3–8 sentences. Never more than 8 sentences.
- Break the text into short paragraphs. Each paragraph has at most 2 sentences.
- Wrap each paragraph in <p> tags. Do NOT use <br> or <br><br> for paragraph breaks.
- Do NOT write long blocks of text. Keep it short and scannable.

LANGUAGE & STYLE:
- Very simple English — many readers are not native speakers
- Short sentences. Simple words. No idioms, no slang.
- Be direct. Like explaining to a friend.
- Do NOT use labels like "Probability assessment:", "What X needs:", "In short:", "Bottom line:" — just write the content directly
- No filler words
- NEVER use negations like "does not lose", "does not beat", "fails to win". Instead use positive phrasing: "wins or draws", "draws or loses". Negations are harder to parse for non-native speakers. Always prefer the simplest, most direct phrasing.

CONTENT — VERY IMPORTANT:
- You are given ALL distinct outcome combinations that lead to this position. Do not omit any path, even if it requires a large goal difference or seems unlikely.
- When a combination requires a specific minimum goal difference (shown as "by X+ goals"), always state this threshold explicitly. These are the most interesting edge cases for the reader.
- SIMPLIFY AGGRESSIVELY: If all combinations share the same condition for the analyzed team (e.g. the team loses in all of them), just state that one condition. Do NOT list what happens in the other match separately for each variant — say "regardless of the other result" or omit the other match entirely. Only mention the other match when its result actually matters (i.e. some outcomes of the other match lead to this position and others do not).
- Never list multiple numbered paths that differ only in an irrelevant match result. Merge them into one statement.
- ACCURACY IS PARAMOUNT: Before writing ANY general claim (e.g. "must win", "must not lose", "needs to beat X"), verify it against ALL provided combinations. If even ONE combination contradicts the claim, DO NOT make it. For example, if 6 out of 7 combinations show a win but 1 shows a loss, do NOT say "must win" — instead describe the different paths accurately. Over-generalizing is a serious error.
- If a team qualifies no matter what, say so
- If a team is eliminated no matter what, say so
- When other matches matter, name them (e.g. "…if Germany draws or loses to Japan")
- Mention probability in one sentence — is this the most likely outcome, or a long shot?

FORMATTING:
- Use team names, never IDs
- Wrap team names in <strong> tags INLINE — never put <strong> on its own line. Write "<strong>Mexico</strong> needs" not "<strong>\nMexico\n</strong> needs"
- Do NOT use markdown — output clean HTML only
- Output must be a SINGLE LINE of HTML — no newlines inside the output. Use <br><br> for paragraph breaks.
- For multiple distinct paths, use numbered items:
  <div class="scenario-paths"><div class="scenario-path"><span class="scenario-path-num">1</span><span class="scenario-path-text">Path here (1-2 sentences max)</span></div><div class="scenario-path"><span class="scenario-path-num">2</span><span class="scenario-path-text">Path here (1-2 sentences max)</span></div></div>
- For a single path: <div class="scenario-path single">Description here.</div>
- Position labels: 1st = group winner, 2nd = runner-up (both auto-qualify), 3rd = may qualify as best third-placed, 4th = eliminated
- IMPORTANT: Cover all key scenarios but be brief — do not repeat yourself
- IMPORTANT: This is a tournament — all matches are played at neutral venues. Never say "home" or "away". Just say "plays against" or "faces".`;

interface AiSummaryInput {
  teamId: number;
  teamName: string;
  groupId: string;
  position: number;
  probability: number;
  /** Probabilities for ALL positions — so the AI can compare and contextualize */
  allProbabilities: { [pos: number]: number };
  remainingMatches: {
    homeTeam: string;
    awayTeam: string;
    isTeamMatch: boolean;
  }[];
  /** All outcome patterns like "H3|D0|A2" — the complete set of result combos leading to this position */
  outcomePatterns: string[];
  /** Current standings context */
  currentStandings: { teamName: string; points: number; gd: number; position: number }[];
}

/**
 * Generate an AI-powered summary for a single team+position combo.
 */
async function generateAiSummary(input: AiSummaryInput): Promise<string> {
  const matchList = input.remainingMatches
    .map((m, i) => `  Match ${i}: ${m.homeTeam} vs ${m.awayTeam}${m.isTeamMatch ? ' (team\'s own match)' : ''}`)
    .join('\n');

  // Reduce patterns to unique W/D/L combinations with min GD thresholds
  const { text: patternExplanation, reducedCount } = reduceAndDecodePatterns(
    input.outcomePatterns, input.remainingMatches,
  );

  const standingsContext = input.currentStandings
    .map(s => `  ${s.position}. ${s.teamName} — ${s.points} pts, GD ${s.gd >= 0 ? '+' : ''}${s.gd}`)
    .join('\n');

  // Build probability comparison context
  const probLines = [1, 2, 3, 4]
    .filter(p => (input.allProbabilities[p] ?? 0) > 0)
    .map(p => `  ${p}${posLabel(p)}: ${(input.allProbabilities[p] ?? 0).toFixed(1)}%${p === input.position ? ' ← THIS POSITION' : ''}`)
    .join('\n');

  // Pre-analyze own-match outcomes and group other-match conditions by own outcome
  // This gives the AI a clear, pre-computed structure so it can't misinterpret the data
  const ownMatchIdx = input.remainingMatches.findIndex(m => m.isTeamMatch);
  let preComputedPaths = '';
  if (ownMatchIdx >= 0) {
    const ownMatch = input.remainingMatches[ownMatchIdx];
    const teamIsHome = ownMatch.homeTeam === input.teamName;
    const winLetter = teamIsHome ? 'H' : 'A';
    const loseLetter = teamIsHome ? 'A' : 'H';
    const opponent = teamIsHome ? ownMatch.awayTeam : ownMatch.homeTeam;
    const otherMatches = input.remainingMatches.filter((_, i) => i !== ownMatchIdx);

    // Group reduced patterns by own-match outcome, collect other-match conditions
    const grouped: Record<string, Set<string>> = {};
    for (const pattern of input.outcomePatterns) {
      const parts = pattern.split('|');
      const ownLetter = parts[ownMatchIdx]?.charAt(0);
      const ownLabel = ownLetter === winLetter ? 'WIN' : ownLetter === 'D' ? 'DRAW' : 'LOSS';

      if (!grouped[ownLabel]) grouped[ownLabel] = new Set();
      // Build other-match conditions
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
        pathLines.push(`  ${outcome}: ${input.teamName} ${verb} → reaches this position`);
      } else if (condArray.length === otherMatches.length * 3 || condArray.length >= 3) {
        // All other-match outcomes work → simplify
        const allOutcomes = new Set(condArray.flatMap(c => [c]));
        // Check if truly all outcomes of the other match are covered
        pathLines.push(`  ${outcome}: ${input.teamName} ${verb}, and: ${condArray.join(' OR ')}`);
      } else {
        pathLines.push(`  ${outcome}: ${input.teamName} ${verb}, and: ${condArray.join(' OR ')}`);
      }
    }

    preComputedPaths = `\nPRE-COMPUTED PATHS (use these EXACTLY — do not reinterpret the raw patterns):\n${pathLines.join('\n')}`;
    if (grouped['LOSS']) {
      preComputedPaths += `\n⚠️ ${input.teamName} CAN reach this position even when LOSING. Include this as a numbered path.`;
    }
  }

  const userPrompt = `Team: ${input.teamName} (Group ${input.groupId})
Position analyzed: ${input.position}${posLabel(input.position)} — probability ${input.probability.toFixed(1)}%

All position probabilities for ${input.teamName}:
${probLines}

Current standings:
${standingsContext}

Remaining matches in the group:
${matchList}

There are ${reducedCount} distinct outcome combinations (reduced from ${input.outcomePatterns.length} goal-difference variants) that lead to ${input.teamName} finishing ${input.position}${posLabel(input.position)}.

All outcome combinations (with minimum required goal differences where relevant):
${patternExplanation}
${preComputedPaths}

Write the scenario summary for this position. Start with a probability assessment — is this likely, possible, or a long shot? How does it compare to the other positions?`;

  const response = await withClaudeSlot(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }));

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text ?? '';
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
  const str = 'v5:' + sorted.join('|');
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
  outcomePatternsByPosition: { [pos: number]: string[] };
  probabilities: { [pos: number]: number };
  remainingMatches: RemainingMatchInfo[];
  currentStandings: { teamName: string; points: number; gd: number; position: number }[];
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

/** Per-position timeout for Claude API call (seconds) */
const AI_CALL_TIMEOUT_MS = 15_000;

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

    const patterns = ctx.outcomePatternsByPosition[pos] ?? [];
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

export async function generateAiScenarioSummaries(
  ctx: AiSummaryContext,
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

    const patterns = ctx.outcomePatternsByPosition[pos] ?? [];
    if (patterns.length === 0) continue;

    const pHash = hashPatterns(patterns);

    // Try cache first
    try {
      const cached = await getCachedAiSummary(ctx.groupId, ctx.teamId, pos, pHash);
      if (cached) {
        result[pos] = cached;
        continue;
      }
    } catch {
      // Cache table might not exist yet — will generate fresh
    }

    tasks.push({ pos, patterns, pHash });
  }

  if (tasks.length === 0) return result;

  // Feature flag: when AI predictions are disabled we still serve any cached
  // summaries found above, but skip fresh Claude calls entirely.
  const aiEnabled = await isFeatureEnabled('ai_predictions', true);
  if (!aiEnabled) return result;

  // Run all uncached API calls in parallel with timeout
  const promises = tasks.map(async ({ pos, patterns, pHash }) => {
    try {
      const summary = await withTimeout(
        generateAiSummary({
          teamId: ctx.teamId,
          teamName: ctx.teamName,
          groupId: ctx.groupId,
          position: pos,
          probability: ctx.probabilities[pos] ?? 0,
          allProbabilities: ctx.probabilities,
          remainingMatches: remainingMatchesForPrompt,
          outcomePatterns: patterns,
          currentStandings: ctx.currentStandings,
        }),
        AI_CALL_TIMEOUT_MS,
      );

      if (summary) {
        result[pos] = summary;
        // Save to cache (best-effort)
        try {
          await saveAiSummary(ctx.groupId, ctx.teamId, pos, summary, pHash);
        } catch {
          // Cache write failure is non-fatal
        }
      }
    } catch (err) {
      console.error(`AI summary failed for ${ctx.teamName} pos ${pos}:`, err);
    }
  });

  await Promise.allSettled(promises);

  return result;
}
