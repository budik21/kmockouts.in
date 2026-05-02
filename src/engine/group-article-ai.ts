/**
 * AI-generated group article — a sports-journalism-style write-up of one
 * World Cup group, synthesized from the per-team scenario summaries that
 * the granular AI layer (scenario-summary-ai.ts) has already produced.
 *
 * Output shape: { headline, lede, body_html } — meant to be rendered at
 * the top of /worldcup2026/[groupId] and reused as title/description in
 * page metadata.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query } from '../lib/db';
import { withClaudeSlot } from '../lib/claude-concurrency';
import { isFeatureEnabled, isAiGenerationEnabledByEnv } from '../lib/feature-flags';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a sports journalist writing for a World Cup prediction website. Your tone is BBC Sport / The Athletic — engaging, narrative, and confident — but the language MUST stay simple because most readers are not native English speakers.

YOUR JOB:
Given a group's current standings, remaining matches, qualification probabilities, and the per-team scenario summaries that have already been generated, write a short, readable article about the group.

CRITICAL CONTENT RULE:
The reader MUST come away knowing two things:
1. Which team is most likely to advance (and why).
2. Where the real tension is — who is fighting for second, who is on the brink.
If the article does not deliver these two facts clearly in the first two paragraphs, it has failed.

OUTPUT FORMAT — VERY IMPORTANT:
Return ONLY a single valid JSON object, nothing else. No markdown fences, no commentary. Shape:
{
  "headline": "...",
  "lede": "...",
  "body_html": "..."
}

HEADLINE:
- 6 to 10 words.
- Punchy, news-style — like a real sports headline.
- Name at least one team.
- Examples of the right register: "Mexico edge ahead as Group A tightens", "Germany cruise; Japan and Costa Rica fight for second", "Group F wide open after Croatia stumble".
- Do NOT use generic titles like "Group A standings" or "Group A analysis".

LEDE (perex):
- 1 to 2 sentences. 30 to 45 words total.
- Must state who is most likely to top the group AND where the main race is.
- Suitable for use as a meta description in search results — make it standalone and informative.
- No HTML tags in the lede. Plain text only.

BODY_HTML:
- 3 to 4 paragraphs. 350 to 500 words total.
- Wrap each paragraph in <p>...</p>. No other tags except <strong> for team names on first mention in the body.
- Paragraph 1: Lead team — who tops the group and what they need. Be specific about the path.
- Paragraph 2: The race for the remaining qualifying spots. Who is in contention, who is in trouble.
- Paragraph 3: Edge cases, key remaining match(es), best-third implications if relevant.
- Optional Paragraph 4: What to watch — the single result that would shake up the group most.

LANGUAGE & STYLE:
- Short sentences. Simple, common words. No idioms, no slang, no clichés like "must-win clash".
- Active voice. Present tense for current standings, future-conditional ("a win would...") for scenarios.
- Use team names. Never use IDs.
- All matches are on neutral venues — never write "home" or "away". Use "face", "play", "meet".
- Never use double negations. Prefer "wins or draws" over "does not lose".
- Do NOT use section labels like "Bottom line:", "What's at stake:", "Verdict:". Just write the prose.
- Do NOT invent facts. Use only the data and per-team summaries provided.
- Do NOT contradict the per-team summaries — they are the source of truth for what each team needs.

ACCURACY:
- The probabilities are exact. If a team has 0% chance of finishing 1st, do not suggest they could top the group.
- "Already qualified" / "guaranteed top" / "eliminated" claims must match the probability data exactly (100% or 0%).
- If two teams have very similar probabilities, treat the race as open. Do not pick a favourite when the data says it is a coin flip.

MATCH SCORES — NON-NEGOTIABLE RULE:
- The "Played matches" block lists every already-played match in the
  group with its EXACT final score. That is the ONLY source of truth
  for past results.
- NEVER state a specific scoreline (e.g. "3-0 win", "1-0 defeat") for
  any match unless that exact scoreline appears in the Played matches
  block.
- Do NOT infer or guess scorelines from goal difference, points, or any
  other data. Inventing plausible-sounding scores is a critical failure.
- If you want to describe a past match without quoting the score, use
  qualitative language ("opening defeat", "comfortable win", "heavy loss")
  — never numbers.
- The same rule applies to remaining matches: they have not been played,
  so you must NEVER predict a specific scoreline for them.`;

interface RemainingMatchSummary {
  homeTeam: string;
  awayTeam: string;
}

interface PlayedMatchSummary {
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
}

interface TeamGranularSummary {
  teamName: string;
  /** Map of position (1..4) -> probability percent (0..100) */
  probabilities: { [pos: number]: number };
  /** Map of position (1..4) -> already-generated granular HTML (cached) */
  granularSummariesByPosition: { [pos: number]: string };
}

export interface GroupArticleContext {
  groupId: string;
  /** Current standings, ordered 1..4 */
  currentStandings: { teamName: string; points: number; gd: number; position: number }[];
  /** Already-played matches in the group with actual final scores. */
  playedMatches: PlayedMatchSummary[];
  remainingMatches: RemainingMatchSummary[];
  /** One entry per team in the group */
  teams: TeamGranularSummary[];
}

export interface GeneratedGroupArticle {
  headline: string;
  lede: string;
  body_html: string;
}

interface GenerateResult extends GeneratedGroupArticle {
  inputTokens: number;
  outputTokens: number;
}

export interface GroupArticleUsageStats {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

const AI_CALL_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildUserPrompt(ctx: GroupArticleContext): string {
  const standings = ctx.currentStandings
    .map(s => `  ${s.position}. ${s.teamName} — ${s.points} pts, GD ${s.gd >= 0 ? '+' : ''}${s.gd}`)
    .join('\n');

  const played = ctx.playedMatches.length
    ? ctx.playedMatches.map((m, i) => `  Match ${i + 1}: ${m.homeTeam} ${m.homeGoals}-${m.awayGoals} ${m.awayTeam}`).join('\n')
    : '  (no matches played yet)';

  const remaining = ctx.remainingMatches.length
    ? ctx.remainingMatches.map((m, i) => `  Match ${i + 1}: ${m.homeTeam} vs ${m.awayTeam}`).join('\n')
    : '  (no remaining matches)';

  const perTeam = ctx.teams.map(t => {
    const probLines = [1, 2, 3, 4]
      .map(p => `      ${p}${posLabel(p)}: ${(t.probabilities[p] ?? 0).toFixed(1)}%`)
      .join('\n');

    const summaryLines = [1, 2, 3, 4]
      .filter(p => (t.probabilities[p] ?? 0) > 0 && t.granularSummariesByPosition[p])
      .map(p => `      ${p}${posLabel(p)}: ${stripHtml(t.granularSummariesByPosition[p])}`)
      .join('\n');

    return `  ${t.teamName}:\n    Probabilities:\n${probLines}\n    Per-position scenarios (use these as the source of truth):\n${summaryLines || '      (none — already decided)'}`;
  }).join('\n\n');

  return `Group: ${ctx.groupId}

Current standings:
${standings}

Played matches in the group (these are the ONLY scorelines you may quote):
${played}

Remaining matches in the group (no scoreline yet — do NOT predict one):
${remaining}

Per-team data:
${perTeam}

Write the group article now. Return ONLY the JSON object — no markdown, no preamble.`;
}

function posLabel(pos: number): string {
  switch (pos) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    case 4: return 'th';
    default: return '';
  }
}

/**
 * Parse Claude's JSON response. Tolerant of leading/trailing whitespace and
 * accidental markdown fences, but rejects anything that isn't a clean object
 * with the three required string fields.
 */
function parseArticleResponse(raw: string): GeneratedGroupArticle | null {
  let text = raw.trim();

  // Strip ```json ... ``` fences if Claude added them despite instructions.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();

  // Find first { and last } in case there's extra prose.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) return null;
  const slice = text.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const headline = typeof obj.headline === 'string' ? obj.headline.trim() : '';
  const lede = typeof obj.lede === 'string' ? obj.lede.trim() : '';
  const body_html = typeof obj.body_html === 'string' ? obj.body_html.trim() : '';
  if (!headline || !lede || !body_html) return null;
  return { headline, lede, body_html };
}

async function generateGroupArticle(ctx: GroupArticleContext): Promise<GenerateResult | null> {
  const userPrompt = buildUserPrompt(ctx);

  const response = await withClaudeSlot(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }));

  const textBlock = response.content.find(b => b.type === 'text');
  const raw = textBlock?.text ?? '';
  const parsed = parseArticleResponse(raw);
  if (!parsed) return null;

  return {
    ...parsed,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

// ============================================================
// Cache layer
// ============================================================

interface GroupArticleRow {
  group_id: string;
  headline: string;
  lede: string;
  body_html: string;
  content_hash: string;
  created_at: string;
}

/**
 * Hash of all inputs that would change the article. Bump the version salt
 * when the prompt changes to invalidate every cached article.
 */
function hashContext(ctx: GroupArticleContext): string {
  // Standings as compact "pos:name:pts:gd"
  const standings = ctx.currentStandings
    .map(s => `${s.position}:${s.teamName}:${s.points}:${s.gd}`)
    .join('|');

  const played = ctx.playedMatches
    .map(m => `${m.homeTeam}-${m.awayTeam}:${m.homeGoals}-${m.awayGoals}`)
    .join('|');

  const remaining = ctx.remainingMatches
    .map(m => `${m.homeTeam}-${m.awayTeam}`)
    .join('|');

  const perTeam = ctx.teams
    .map(t => {
      const probs = [1, 2, 3, 4].map(p => `${p}=${(t.probabilities[p] ?? 0).toFixed(1)}`).join(',');
      const summaries = [1, 2, 3, 4]
        .map(p => t.granularSummariesByPosition[p] ?? '')
        .join('§');
      return `${t.teamName}{${probs}}<${summaries}>`;
    })
    .join('||');

  // v2: prompt now includes played match scores; bump to invalidate stale
  // articles that may have hallucinated scorelines.
  const str = `v2:${ctx.groupId}|${standings}|played:${played}|rem:${remaining}|${perTeam}`;

  // djb2-ish 32-bit hash
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

export async function getCachedGroupArticle(groupId: string): Promise<GeneratedGroupArticle | null> {
  try {
    const rows = await query<GroupArticleRow>(
      'SELECT * FROM ai_group_article_cache WHERE group_id = $1',
      [groupId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return { headline: row.headline, lede: row.lede, body_html: row.body_html };
  } catch {
    // Table missing or DB error — let caller fall back gracefully.
    return null;
  }
}

async function getCachedGroupArticleByHash(
  groupId: string,
  contentHash: string,
): Promise<GeneratedGroupArticle | null> {
  try {
    const rows = await query<GroupArticleRow>(
      'SELECT * FROM ai_group_article_cache WHERE group_id = $1 AND content_hash = $2',
      [groupId, contentHash],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return { headline: row.headline, lede: row.lede, body_html: row.body_html };
  } catch {
    return null;
  }
}

async function saveGroupArticle(
  groupId: string,
  article: GeneratedGroupArticle,
  contentHash: string,
): Promise<void> {
  await query(
    `INSERT INTO ai_group_article_cache (group_id, headline, lede, body_html, content_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_id)
     DO UPDATE SET headline = $2, lede = $3, body_html = $4, content_hash = $5, created_at = NOW()`,
    [groupId, article.headline, article.lede, article.body_html, contentHash],
  );
}

// ============================================================
// Public API
// ============================================================

export interface PregenerateGroupArticleOptions {
  /** Skip cache lookup and regenerate even if hash matches. */
  force?: boolean;
  /** Bypass the env kill-switch + DB feature flag (superadmin path). */
  ignoreFlags?: boolean;
  /** Usage accumulator. */
  usage?: GroupArticleUsageStats;
}

/**
 * Generate (or refresh) the article for one group and persist it.
 * Cheap when nothing has changed — the input hash check returns immediately
 * without calling Claude.
 *
 * Designed to be called from the match-update webhook AFTER the per-team
 * granular AI summaries have been refreshed for the same group, so the
 * granular HTML this function reads from cache is up to date.
 */
export async function pregenerateGroupArticle(
  ctx: GroupArticleContext,
  options: PregenerateGroupArticleOptions = {},
): Promise<GeneratedGroupArticle | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  if (!options.ignoreFlags) {
    if (!isAiGenerationEnabledByEnv()) {
      console.log(`[pregenerate] Skipping group article (AI_PREDICTIONS_ENABLED env off) for group ${ctx.groupId}`);
      return null;
    }
    if (!(await isFeatureEnabled('ai_predictions', true))) {
      console.log(`[pregenerate] Skipping group article (ai_predictions flag off) for group ${ctx.groupId}`);
      return null;
    }
  }

  const contentHash = hashContext(ctx);

  if (!options.force) {
    const cached = await getCachedGroupArticleByHash(ctx.groupId, contentHash);
    if (cached) return cached;
  }

  console.log(`[pregenerate] Generating group article for ${ctx.groupId}${options.force ? ' [FORCE]' : ''}`);

  try {
    const result = await withTimeout(generateGroupArticle(ctx), AI_CALL_TIMEOUT_MS);
    if (!result) {
      console.error(`[pregenerate] Group article parse failed for ${ctx.groupId}`);
      return null;
    }

    if (options.usage) {
      options.usage.calls += 1;
      options.usage.inputTokens += result.inputTokens;
      options.usage.outputTokens += result.outputTokens;
    }

    const article: GeneratedGroupArticle = {
      headline: result.headline,
      lede: result.lede,
      body_html: result.body_html,
    };

    try {
      await saveGroupArticle(ctx.groupId, article, contentHash);
    } catch (err) {
      console.error(`[pregenerate] Group article cache write failed for ${ctx.groupId}:`, err);
    }

    return article;
  } catch (err) {
    console.error(`[pregenerate] Group article generation failed for ${ctx.groupId}:`, err);
    return null;
  }
}
