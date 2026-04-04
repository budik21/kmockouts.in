/**
 * AI-powered scenario summary generation using Claude API.
 *
 * Sends all computed outcome patterns (edge conditions) to Claude
 * and gets back a punchy, readable English interpretation of what
 * a team needs to qualify — or what would knock them out.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query } from '../lib/db';
import { RemainingMatchInfo } from './scenario-summary';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a football (soccer) analyst writing for a World Cup prediction website.

Your job: given a team's computed qualification scenarios, write a clear summary of what the team needs.

STRUCTURE — VERY IMPORTANT:
1. FIRST SENTENCE: Start with the shortest possible verdict. One sentence that tells the reader what must happen. Examples:
   - "A win against Japan is enough."
   - "Mexico needs to beat South Korea and hope Czech Republic does not win."
   - "Only a very specific combination of results can save them."
   - "Already safe — any result will do."
2. SECOND SENTENCE: Probability context — is this likely or unlikely? Compare to other positions. One sentence only.
3. THEN (only if needed): A short explanation of the key edge condition or alternative path.

LENGTH — VERY IMPORTANT:
- The TOTAL output must be 3–6 sentences. Never more than 6 sentences.
- Break the text into short paragraphs. Each paragraph has at most 2 sentences.
- Wrap each paragraph in <p> tags. Do NOT use <br> or <br><br> for paragraph breaks.
- Do NOT write long blocks of text. Keep it short and scannable.

LANGUAGE & STYLE:
- Very simple English — many readers are not native speakers
- Short sentences. Simple words. No idioms, no slang.
- Be direct. Like explaining to a friend.
- Do NOT use labels like "Probability assessment:", "What X needs:", "In short:", "Bottom line:" — just write the content directly
- No filler words

CONTENT:
- Focus on EDGE CONDITIONS: what is the minimum the team needs? Or the maximum that is not enough?
- If a team qualifies no matter what, say so
- If a team is eliminated no matter what, say so
- When other matches matter, name them (e.g. "…if Germany do not beat Japan")
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
- IMPORTANT: Cover all key scenarios but be brief — do not repeat yourself`;

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

  // Decode patterns into human-readable form for the prompt
  const patternExplanation = input.outcomePatterns.length <= 200
    ? input.outcomePatterns.map(p => decodePattern(p, input.remainingMatches)).join('\n')
    : summarizePatterns(input.outcomePatterns, input.remainingMatches);

  const standingsContext = input.currentStandings
    .map(s => `  ${s.position}. ${s.teamName} — ${s.points} pts, GD ${s.gd >= 0 ? '+' : ''}${s.gd}`)
    .join('\n');

  // Build probability comparison context
  const probLines = [1, 2, 3, 4]
    .filter(p => (input.allProbabilities[p] ?? 0) > 0)
    .map(p => `  ${p}${posLabel(p)}: ${(input.allProbabilities[p] ?? 0).toFixed(1)}%${p === input.position ? ' ← THIS POSITION' : ''}`)
    .join('\n');

  const userPrompt = `Team: ${input.teamName} (Group ${input.groupId})
Position analyzed: ${input.position}${posLabel(input.position)} — probability ${input.probability.toFixed(1)}%

All position probabilities for ${input.teamName}:
${probLines}

Current standings:
${standingsContext}

Remaining matches in the group:
${matchList}

There are ${input.outcomePatterns.length} distinct result combinations (with goal differences) that lead to ${input.teamName} finishing ${input.position}${posLabel(input.position)}.

${input.outcomePatterns.length <= 200 ? 'All combinations decoded:' : 'Pattern summary (too many to list individually):'}
${patternExplanation}

Write the scenario summary for this position. Start with a probability assessment — is this likely, possible, or a long shot? How does it compare to the other positions?`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

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
 * Decode a pattern like "H3|D0|A2" into readable text using match info.
 */
function decodePattern(
  pattern: string,
  matches: { homeTeam: string; awayTeam: string; isTeamMatch: boolean }[],
): string {
  const parts = pattern.split('|');
  const decoded = parts.map((part, i) => {
    const outcome = part.charAt(0);
    const gd = parseInt(part.slice(1), 10);
    const m = matches[i];
    if (!m) return part;

    if (outcome === 'H') return `${m.homeTeam} beats ${m.awayTeam} by ${gd}`;
    if (outcome === 'A') return `${m.awayTeam} beats ${m.homeTeam} by ${gd}`;
    return `${m.homeTeam} draws with ${m.awayTeam}`;
  });
  return '  ' + decoded.join(', ');
}

/**
 * When there are too many patterns (>200), create a statistical summary
 * so the AI can still reason about them without exceeding context.
 */
function summarizePatterns(
  patterns: string[],
  matches: { homeTeam: string; awayTeam: string; isTeamMatch: boolean }[],
): string {
  const matchCount = matches.length;
  const lines: string[] = [];

  for (let i = 0; i < matchCount; i++) {
    const m = matches[i];
    const outcomes = { H: 0, D: 0, A: 0 };
    const minGd: Record<string, number> = { H: Infinity, D: 0, A: Infinity };
    const maxGd: Record<string, number> = { H: 0, D: 0, A: 0 };

    for (const p of patterns) {
      const parts = p.split('|');
      const outcome = parts[i].charAt(0) as 'H' | 'D' | 'A';
      const gd = parseInt(parts[i].slice(1), 10);
      outcomes[outcome]++;
      if (gd < minGd[outcome]) minGd[outcome] = gd;
      if (gd > maxGd[outcome]) maxGd[outcome] = gd;
    }

    lines.push(`  Match ${i}: ${m.homeTeam} vs ${m.awayTeam}${m.isTeamMatch ? ' (own)' : ''}`);
    for (const o of ['H', 'D', 'A'] as const) {
      if (outcomes[o] > 0) {
        const label = o === 'H' ? `${m.homeTeam} wins` : o === 'A' ? `${m.awayTeam} wins` : 'Draw';
        const pct = ((outcomes[o] / patterns.length) * 100).toFixed(0);
        const gdRange = o === 'D' ? '' : ` (GD ${minGd[o]}-${maxGd[o]})`;
        lines.push(`    ${label}: ${outcomes[o]}/${patterns.length} patterns (${pct}%)${gdRange}`);
      }
    }
  }

  return lines.join('\n');
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
  const sorted = [...patterns].sort();
  let hash = 0;
  const str = sorted.join('|');
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
