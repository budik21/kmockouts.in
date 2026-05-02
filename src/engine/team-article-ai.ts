/**
 * AI-generated team article — a sports-journalism-style write-up of one
 * team's situation in the group, written from THAT team's perspective.
 * Focused on the question: "what does this team need for play-off?"
 *
 * Output shape: { headline, lede, body_html } — meant to be rendered at
 * the top of /worldcup2026/[groupId]/team/[teamId] and reused as
 * title/description in page metadata.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query } from '../lib/db';
import { withClaudeSlot } from '../lib/claude-concurrency';
import { isFeatureEnabled, isAiGenerationEnabledByEnv } from '../lib/feature-flags';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a football writer for a World Cup prediction website. Your tone is energetic and creative — terrace-talk meets a clued-up tactics column. Football slang is welcome in the headline; the body stays readable for non-native English speakers.

YOUR JOB:
Write a short article about ONE team's situation in their World Cup group, told from THAT team's point of view. Answer the single question the fan is asking, as directly as possible:

  → "What does MY team need for the team to advance to the Round of 32 (play-off)?"

The team's qualification status drives the angle:

  CASE A — Already through (top-2 guaranteed, i.e. P(1st)+P(2nd) = 100%):
    Recap how they got there. What clicked. Who delivered. What this means
    for the knockout phase.

  CASE B — Mathematically eliminated (P(4th) = 100% OR no remaining match
  can lift them above the qualification line):
    Recap WHY they are out. What went wrong. Which result(s) buried them.
    No false hope.

  CASE C — Still alive (the typical case):
    Spell out the path. What must happen in the team's own remaining match,
    and — if relevant — what must also happen in the OTHER match in the
    group. Use the per-position scenario summaries as the source of truth.
    If they can also sneak through as one of the eight best third-placed
    teams, mention that as a secondary route.

CRITICAL CONTENT RULE:
The first two paragraphs MUST tell the reader, in plain words, the answer
to "what does this team need?". If the article does not deliver that
answer up top, it has failed.

OUTPUT FORMAT — VERY IMPORTANT:
Return ONLY a single valid JSON object, nothing else. No markdown fences,
no commentary. Shape:
{
  "headline": "...",
  "lede": "...",
  "body_html": "..."
}

HEADLINE:
- 5 to 10 words. Maximally creative.
- Football slang and idiom are encouraged here (and ONLY here).
- Examples of the right register:
    "Brazil have one foot in the last 32"
    "Win or bust for the Socceroos"
    "Japan need a miracle in Atlanta"
    "Job done: Germany cruise into the knockouts"
    "Ghana out — and the goodbye stings"
- Name the team OR an unmistakable nickname.
- Do NOT use generic titles like "Team analysis" or "Group A — Brazil".

LEDE (perex):
- 1 to 2 sentences. 30 to 45 words total.
- States the team's qualification situation and what they need (or, in
  CASE A/B, why they are through / why they are out).
- Suitable for a meta description in search results — standalone, informative.
- Plain text. No HTML tags.
- Plain English here — save the slang for the headline.

BODY_HTML:
- 3 to 4 paragraphs. 300 to 450 words total.
- Wrap each paragraph in <p>...</p>. The only other allowed tag is <strong>
  for the team or opponent name on first mention in the body.
- Paragraph 1: The headline answer. What the team needs / why they are
  through / why they are out — in concrete terms (e.g. "a draw against
  Croatia is enough" / "even a 2-0 win would not be sufficient because…").
- Paragraph 2: The realistic scenarios. Walk through the most plausible
  paths to qualification (or, in CASE B, the moment it slipped away).
  Reference the other match in the group when its outcome matters.
- Paragraph 3: Best-third route, head-to-head tiebreakers, or the single
  result that would shake things up most. Include this paragraph only if
  it adds something the previous paragraphs did not cover.
- Optional Paragraph 4: A short closing — the next match, what to watch.

LANGUAGE & STYLE:
- Body: short sentences, simple common words. Headline: be punchy.
- Active voice. Present tense for the current standings, future-conditional
  ("a win would…", "a draw still leaves them needing…") for scenarios.
- Use real team names. Never use IDs.
- All matches are on neutral venues — never write "home" or "away".
  Use "face", "play", "meet".
- Never use double negations. Prefer "wins or draws" over "does not lose".
- Do NOT use section labels like "Bottom line:", "What's at stake:".
- Do NOT invent facts. Use only the data and per-position summaries provided.
- Do NOT contradict the per-position summaries — they are the source of
  truth for what the team needs at each finishing place.

ACCURACY:
- The probabilities are exact. If P(1st) = 0%, the team cannot top the
  group — do not suggest otherwise.
- "Already through" / "guaranteed top" / "eliminated" claims must match
  the probability data exactly (100% or 0%).
- "Best-third route" should only be discussed when P(3rd) > 0.
- Do not pick a favourite finishing place when two probabilities are
  similar — present the race as open.`;

interface RemainingMatchSummary {
  homeTeam: string;
  awayTeam: string;
  /** True when this is the team's own remaining match. */
  isTeamMatch: boolean;
}

export interface TeamArticleContext {
  groupId: string;
  teamId: number;
  teamName: string;
  /** Current standings of the whole group, ordered 1..4. */
  currentStandings: { teamName: string; points: number; gd: number; position: number }[];
  /** Remaining matches in the group (with isTeamMatch flag). */
  remainingMatches: RemainingMatchSummary[];
  /** Map of position (1..4) -> probability percent (0..100) for THIS team. */
  probabilities: { [pos: number]: number };
  /**
   * Probability (0..100) of qualifying as one of the eight best third-placed
   * teams across all 12 groups. Conditional on actually finishing 3rd, i.e.
   * the value already cached in `probability_cache.prob_third_qual`.
   */
  bestThirdQualProb: number;
  /** Per-position scenario summaries (cached HTML) for THIS team. */
  granularSummariesByPosition: { [pos: number]: string };
}

export interface GeneratedTeamArticle {
  headline: string;
  lede: string;
  body_html: string;
}

interface GenerateResult extends GeneratedTeamArticle {
  inputTokens: number;
  outputTokens: number;
}

export interface TeamArticleUsageStats {
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

function posLabel(pos: number): string {
  switch (pos) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    case 4: return 'th';
    default: return '';
  }
}

function buildUserPrompt(ctx: TeamArticleContext): string {
  const standings = ctx.currentStandings
    .map(s => {
      const marker = s.teamName === ctx.teamName ? '  ← THIS TEAM' : '';
      return `  ${s.position}. ${s.teamName} — ${s.points} pts, GD ${s.gd >= 0 ? '+' : ''}${s.gd}${marker}`;
    })
    .join('\n');

  const remaining = ctx.remainingMatches.length
    ? ctx.remainingMatches
        .map((m, i) => `  Match ${i + 1}: ${m.homeTeam} vs ${m.awayTeam}${m.isTeamMatch ? '  ← team\'s own match' : ''}`)
        .join('\n')
    : '  (no remaining matches)';

  const probLines = [1, 2, 3, 4]
    .map(p => `  ${p}${posLabel(p)}: ${(ctx.probabilities[p] ?? 0).toFixed(1)}%`)
    .join('\n');

  const summaryLines = [1, 2, 3, 4]
    .filter(p => (ctx.probabilities[p] ?? 0) > 0 && ctx.granularSummariesByPosition[p])
    .map(p => `  ${p}${posLabel(p)}: ${stripHtml(ctx.granularSummariesByPosition[p])}`)
    .join('\n');

  const bestThirdLine = (ctx.probabilities[3] ?? 0) > 0
    ? `\nBest-third qualification probability (conditional on finishing 3rd): ${ctx.bestThirdQualProb.toFixed(1)}%`
    : '';

  return `Team: ${ctx.teamName} (Group ${ctx.groupId})

Current standings of the whole group:
${standings}

Remaining matches in the group:
${remaining}

Position probabilities for ${ctx.teamName}:
${probLines}${bestThirdLine}

Per-position scenarios for ${ctx.teamName} (use these as the source of truth for what must happen):
${summaryLines || '  (none — group already decided for this team)'}

Write the team article now, from ${ctx.teamName}'s point of view. Return ONLY the JSON object — no markdown, no preamble.`;
}

function parseArticleResponse(raw: string): GeneratedTeamArticle | null {
  let text = raw.trim();

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();

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

async function generateTeamArticle(ctx: TeamArticleContext): Promise<GenerateResult | null> {
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

interface TeamArticleRow {
  team_id: number;
  group_id: string;
  headline: string;
  lede: string;
  body_html: string;
  content_hash: string;
  created_at: string;
}

function hashContext(ctx: TeamArticleContext): string {
  const standings = ctx.currentStandings
    .map(s => `${s.position}:${s.teamName}:${s.points}:${s.gd}`)
    .join('|');

  const remaining = ctx.remainingMatches
    .map(m => `${m.homeTeam}-${m.awayTeam}:${m.isTeamMatch ? '1' : '0'}`)
    .join('|');

  const probs = [1, 2, 3, 4].map(p => `${p}=${(ctx.probabilities[p] ?? 0).toFixed(1)}`).join(',');
  const summaries = [1, 2, 3, 4]
    .map(p => ctx.granularSummariesByPosition[p] ?? '')
    .join('§');

  const str = `v1:${ctx.groupId}:${ctx.teamId}:${ctx.teamName}|${standings}|${remaining}|${probs}|bt=${ctx.bestThirdQualProb.toFixed(1)}|<${summaries}>`;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

export async function getCachedTeamArticle(teamId: number): Promise<GeneratedTeamArticle | null> {
  try {
    const rows = await query<TeamArticleRow>(
      'SELECT * FROM ai_team_article_cache WHERE team_id = $1',
      [teamId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return { headline: row.headline, lede: row.lede, body_html: row.body_html };
  } catch {
    return null;
  }
}

async function getCachedTeamArticleByHash(
  teamId: number,
  contentHash: string,
): Promise<GeneratedTeamArticle | null> {
  try {
    const rows = await query<TeamArticleRow>(
      'SELECT * FROM ai_team_article_cache WHERE team_id = $1 AND content_hash = $2',
      [teamId, contentHash],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return { headline: row.headline, lede: row.lede, body_html: row.body_html };
  } catch {
    return null;
  }
}

async function saveTeamArticle(
  teamId: number,
  groupId: string,
  article: GeneratedTeamArticle,
  contentHash: string,
): Promise<void> {
  await query(
    `INSERT INTO ai_team_article_cache (team_id, group_id, headline, lede, body_html, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (team_id)
     DO UPDATE SET group_id = $2, headline = $3, lede = $4, body_html = $5, content_hash = $6, created_at = NOW()`,
    [teamId, groupId, article.headline, article.lede, article.body_html, contentHash],
  );
}

// ============================================================
// Public API
// ============================================================

export interface PregenerateTeamArticleOptions {
  force?: boolean;
  ignoreFlags?: boolean;
  usage?: TeamArticleUsageStats;
}

export async function pregenerateTeamArticle(
  ctx: TeamArticleContext,
  options: PregenerateTeamArticleOptions = {},
): Promise<GeneratedTeamArticle | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  if (!options.ignoreFlags) {
    if (!isAiGenerationEnabledByEnv()) {
      console.log(`[pregenerate] Skipping team article (AI_PREDICTIONS_ENABLED env off) for team ${ctx.teamName}`);
      return null;
    }
    if (!(await isFeatureEnabled('ai_predictions', true))) {
      console.log(`[pregenerate] Skipping team article (ai_predictions flag off) for team ${ctx.teamName}`);
      return null;
    }
  }

  const contentHash = hashContext(ctx);

  if (!options.force) {
    const cached = await getCachedTeamArticleByHash(ctx.teamId, contentHash);
    if (cached) return cached;
  }

  console.log(`[pregenerate] Generating team article for ${ctx.teamName} (group ${ctx.groupId})${options.force ? ' [FORCE]' : ''}`);

  try {
    const result = await withTimeout(generateTeamArticle(ctx), AI_CALL_TIMEOUT_MS);
    if (!result) {
      console.error(`[pregenerate] Team article parse failed for ${ctx.teamName}`);
      return null;
    }

    if (options.usage) {
      options.usage.calls += 1;
      options.usage.inputTokens += result.inputTokens;
      options.usage.outputTokens += result.outputTokens;
    }

    const article: GeneratedTeamArticle = {
      headline: result.headline,
      lede: result.lede,
      body_html: result.body_html,
    };

    try {
      await saveTeamArticle(ctx.teamId, ctx.groupId, article, contentHash);
    } catch (err) {
      console.error(`[pregenerate] Team article cache write failed for ${ctx.teamName}:`, err);
    }

    return article;
  } catch (err) {
    console.error(`[pregenerate] Team article generation failed for ${ctx.teamName}:`, err);
    return null;
  }
}
