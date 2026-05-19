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
import { getAiPredictionModelId } from '../lib/ai-model-server';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a football writer for a World Cup prediction website. Your tone is energetic and creative — terrace-talk meets a clued-up tactics column. Football slang is welcome in the headline; the body stays readable for non-native English speakers.

YOUR JOB:
Write a short article about ONE team's situation in their World Cup group, told from THAT team's point of view. Answer the single question the fan is asking, as directly as possible:

  → "What does MY team need for the team to advance to the Round of 32 (play-off)?"

The team's qualification status drives the angle:

  CASE A — Already through (top-2 guaranteed, i.e. P(1st)+P(2nd) = 100%):
    Recap how they got there. What clicked. Who delivered. What this means
    for the knockout phase. Past tense for the matches already played.

  CASE B — Mathematically eliminated (P(4th) = 100% OR no remaining match
  can lift them above the qualification line OR 0 remaining matches AND
  bestThirdQualProb = 0%):
    Recap WHY they are out. What went wrong. Which result(s) buried them.
    No false hope.

  CASE C — Still alive WITH remaining matches (the typical mid-group case):
    Spell out the path. What must happen in the team's own remaining match,
    and — if relevant — what must also happen in the OTHER match in the
    group. Use the per-position scenario summaries as the source of truth.
    If they can also sneak through as one of the eight best third-placed
    teams, mention that as a secondary route.

  CASE D — Group ended in 3rd, fate now hangs on cross-group best-third
  comparison (0 remaining matches AND bestThirdQualProb is strictly
  between 0% and 100%):
    Past tense for the group campaign. Then explain the best-third route —
    quote the bestThirdQualProb percentage and describe what would still
    need to happen in OTHER groups for the team to qualify. Do NOT invent
    scorelines for those still-scheduled matches. Reflect the confidence
    level — a 90%+ probability reads very differently from a 20% one.

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
  similar — present the race as open.

STANDINGS TABLE — NON-NEGOTIABLE RULE:
- The "Current standings" block lists every team's EXACT points, goal
  difference, goals scored (GF), and goals conceded (GA). Those numbers
  are the source of truth. Quote them verbatim.
- NEVER state a points total that differs from the table. If a team is
  listed with 4 points, the article MUST say 4 points — not 5, not 3.
- NEVER state a goal difference, goals-for, or goals-against value that
  differs from the table.
- Do NOT recompute totals from the played matches. If your arithmetic
  disagrees with the table, the TABLE is correct; trust it.
- Before writing the lede or any paragraph that names a points total,
  look up the exact row in the standings block and use those numbers.

TIEBREAKER — NON-NEGOTIABLE RULE:
- The "Tiebreaker resolution" block (when present) tells you exactly WHY
  two or more teams ended up in the order shown, when natural sorting
  (points → goal difference → goals scored) does NOT explain it.
- When the block is present and concerns THIS team or a team adjacent to
  it in the standings, the article MUST mention the tiebreaker rule
  cited there (e.g. "edged ahead on head-to-head", "decided on head-to-
  head goal difference", "decided by FIFA ranking") rather than
  attributing the order to "goal difference" or "more goals scored".
- NEVER claim a team finished higher (or lower) "on goal difference" or
  "on goals scored" when the standings table shows those values are
  equal between the relevant teams. The ONLY acceptable explanation in
  that case is the one given in the Tiebreaker resolution block.
- If the Tiebreaker resolution block is missing or empty, the natural
  sort already explains the order — no tiebreaker mention is required.

POSITION TENSE — NON-NEGOTIABLE RULE:
- The "Remaining matches in the group" block counts EVERY unplayed match
  in this group, NOT just this team's own remaining fixtures. If the
  block lists ONE OR MORE matches, the GROUP is STILL IN PROGRESS and
  the final order is NOT determined yet — even when THIS team has
  played all 3 of its own matches, OTHER teams' remaining fixtures can
  still shift the standings around them.
- While the group is still in progress, NEVER use past-tense wording
  for the team's POSITION or final fate. Forbidden phrases include:
    "finished 1st / 2nd / 3rd / 4th", "ended up Xth", "claimed Xth place",
    "wrapped up Xth", "secured 2nd", "took third", "finished as runners-
    up", "finished bottom", "ended their campaign in Xth", "topped the
    group", "ended the group stage in Xth".
- Use present-tense wording instead: "currently sit Xth", "are in Xth
  place", "currently lead the group on N points", "trail Y by N points",
  "are level on points with Z".
- This applies even when THIS team is mathematically guaranteed to
  advance (e.g. P(1st)+P(2nd) = 100% or bestThirdQualProb = 100%): the
  team is GUARANTEED knockout football, but their final POSITION in the
  group is not yet locked, so "they finished third" is FORBIDDEN. Write
  "they have already done enough to reach the Round of 32 from their
  current 3rd-place position" or similar, where the position is framed
  as the present snapshot, not the final outcome.
- Past tense IS fine — and expected — for INDIVIDUAL MATCHES the team
  has already played ("opened with a 2-1 win", "lost to X"). It is the
  POSITION/FINAL-ORDER wording that must stay in present tense until the
  Remaining-matches block reads "(no remaining matches)".
- Only when "Remaining matches in the group" is "(no remaining matches)"
  may the article use past-tense position wording (CASE A wrap-up /
  CASE B eliminated / CASE D best-third pending).

MATCH SCORES — NON-NEGOTIABLE RULE:
- The "Played matches" block lists every already-played match in the
  group with its EXACT final score. That is the ONLY source of truth
  for past results.
- NEVER state a specific scoreline (e.g. "3-0 loss", "1-0 defeat",
  "won 2-1") for any match unless that exact scoreline appears in the
  Played matches block.
- Do NOT infer or guess scorelines from goal difference, points, or any
  other data. Inventing plausible-sounding scores is a critical failure.
- If you want to describe a past match without quoting the score, use
  qualitative language ("opening defeat", "comfortable win", "heavy loss")
  — never numbers.
- The same rule applies to remaining matches: they have not been played,
  so you must NEVER predict a specific scoreline for them.

MATCH COUNT — NON-NEGOTIABLE RULE:
- A World Cup group has exactly 4 teams, and every team plays EXACTLY 3
  group-stage matches in total. Always. No exceptions.
- The user prompt tells you the team's exact played-vs-remaining split.
  Count those entries yourself before you start writing:
    played count + remaining count = 3 (always).
- If the team has 3 played + 0 remaining → the team has FINISHED their
  group. NEVER write "one match left", "remaining match", "their next
  match", "still to play", or any wording that implies they have a
  fixture ahead. The group is over for this team.
- If 0 remaining matches → speak only in past tense about the team's
  own matches, and present/future tense only about OTHER groups' best-
  third comparisons.
- If 1 or 2 remaining → only refer to the matches actually listed in
  the Remaining matches block. Do NOT invent extra fixtures.
- If you contradict the played/remaining counts (e.g. saying "one match
  left" when there are 0 remaining), the article is broken and will be
  rejected.`;

interface RemainingMatchSummary {
  homeTeam: string;
  awayTeam: string;
  /** True when this is the team's own remaining match. */
  isTeamMatch: boolean;
}

interface PlayedMatchSummary {
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  /** True when this is the team's own already-played match. */
  isTeamMatch: boolean;
}

export interface TeamArticleContext {
  groupId: string;
  teamId: number;
  teamName: string;
  /** Current standings of the whole group, ordered 1..4. */
  currentStandings: { teamName: string; points: number; gd: number; goalsFor: number; goalsAgainst: number; position: number }[];
  /** Already-played matches in the group with actual final scores. */
  playedMatches: PlayedMatchSummary[];
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
  /** Human-readable tiebreaker explanations for the final order between
   * equal-points teams in this group. Populated by the caller only once
   * every group-stage match has finished. Empty/undefined otherwise. */
  tiebreakerNotes?: string[];
}

export interface GeneratedTeamArticle {
  headline: string;
  lede: string;
  body_html: string;
  /** ISO timestamp of when this article was last (re)generated. Populated
   * by cache readers from `ai_team_article_cache.created_at` so pages can
   * show "AI prediction generated on <date>" to the visitor. */
  generatedAt?: string;
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
      return `  ${s.position}. ${s.teamName} — ${s.points} pts, GD ${s.gd >= 0 ? '+' : ''}${s.gd}, GF ${s.goalsFor}, GA ${s.goalsAgainst}${marker}`;
    })
    .join('\n');

  const teamPlayedCount = ctx.playedMatches.filter(m => m.isTeamMatch).length;
  const teamRemainingCount = ctx.remainingMatches.filter(m => m.isTeamMatch).length;

  const played = ctx.playedMatches.length
    ? ctx.playedMatches
        .map((m, i) => `  Match ${i + 1}: ${m.homeTeam} ${m.homeGoals}-${m.awayGoals} ${m.awayTeam}${m.isTeamMatch ? '  ← team\'s own match' : ''}`)
        .join('\n')
    : '  (no matches played yet)';

  const remaining = ctx.remainingMatches.length
    ? ctx.remainingMatches
        .map((m, i) => `  Match ${i + 1}: ${m.homeTeam} vs ${m.awayTeam}${m.isTeamMatch ? '  ← team\'s own match' : ''}`)
        .join('\n')
    : '  (no remaining matches)';

  const teamMatchTally = teamRemainingCount === 0
    ? `${ctx.teamName} has played ALL ${teamPlayedCount} of their 3 group-stage matches — 0 remaining. The group is OVER for this team.`
    : `${ctx.teamName} has played ${teamPlayedCount} of their 3 group-stage matches — ${teamRemainingCount} remaining (listed above).`;

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

  // Tiebreaker block — only included once the group is fully decided and
  // there is something non-obvious to explain. When present, the article
  // MUST cite the exact criterion (e.g. head-to-head) rather than invent
  // its own reason like "goal difference" when GD is equal.
  const tiebreakerBlock = ctx.tiebreakerNotes && ctx.tiebreakerNotes.length > 0
    ? `\n\nTiebreaker resolution (use this to explain the final order — do NOT invent your own reason):\n${ctx.tiebreakerNotes.map(n => `  - ${n}`).join('\n')}`
    : '';

  return `Team: ${ctx.teamName} (Group ${ctx.groupId})

Current standings of the whole group (THESE NUMBERS ARE THE SOURCE OF TRUTH — quote them verbatim, never round, alter, or recompute):
${standings}${tiebreakerBlock}

Played matches in the group (these are the ONLY scorelines you may quote):
${played}

Remaining matches in the group (no scoreline yet — do NOT predict one):
${remaining}

MATCH TALLY FOR ${ctx.teamName.toUpperCase()} — verify before writing:
  ${teamMatchTally}

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
  const modelId = await getAiPredictionModelId();

  const response = await withClaudeSlot(() => client.messages.create({
    model: modelId,
    max_tokens: 1500,
    // System prompt is static across every team across every group; mark it
    // as cacheable so the API charges the per-request input only for the
    // small user-prompt section. Across hundreds of regenerations per
    // tournament this cuts input cost on the system block by ~10×.
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
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
    .map(s => `${s.position}:${s.teamName}:${s.points}:${s.gd}:${s.goalsFor}:${s.goalsAgainst}`)
    .join('|');

  const played = ctx.playedMatches
    .map(m => `${m.homeTeam}-${m.awayTeam}:${m.homeGoals}-${m.awayGoals}`)
    .join('|');

  const remaining = ctx.remainingMatches
    .map(m => `${m.homeTeam}-${m.awayTeam}:${m.isTeamMatch ? '1' : '0'}`)
    .join('|');

  const probs = [1, 2, 3, 4].map(p => `${p}=${(ctx.probabilities[p] ?? 0).toFixed(1)}`).join(',');
  const summaries = [1, 2, 3, 4]
    .map(p => ctx.granularSummariesByPosition[p] ?? '')
    .join('§');

  const tiebreaker = (ctx.tiebreakerNotes ?? []).join('§');

  // v6: system prompt adds POSITION TENSE rule — past-tense position wording
  // ("finished 3rd", "secured 2nd") is forbidden while ANY match in the group
  // is still unplayed, even when THIS team has played all 3 of its own
  // fixtures and is already guaranteed knockout football. Bump invalidates
  // older articles so the next admin save regenerates against the new rule.
  const str = `v6:${ctx.groupId}:${ctx.teamId}:${ctx.teamName}|${standings}|played:${played}|rem:${remaining}|${probs}|bt=${ctx.bestThirdQualProb.toFixed(1)}|<${summaries}>|tb:${tiebreaker}`;

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
    return { headline: row.headline, lede: row.lede, body_html: row.body_html, generatedAt: row.created_at };
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
  /** When provided, the call appends a per-team entry describing what was sent
   * to Claude and what came back. Drives the superadmin diagnostic e-mail. */
  trace?: import('../lib/match-update-trace').MatchUpdateTrace;
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
    if (cached) {
      options.trace?.teamArticles.push({
        teamId: ctx.teamId,
        teamName: ctx.teamName,
        cacheHit: true,
        output: { headline: cached.headline, lede: cached.lede, body_html: cached.body_html },
        contentHash,
      });
      return cached;
    }
  }

  console.log(`[pregenerate] Generating team article for ${ctx.teamName} (group ${ctx.groupId})${options.force ? ' [FORCE]' : ''}`);

  const userPrompt = buildUserPrompt(ctx);
  const startedAt = Date.now();
  try {
    const result = await withTimeout(generateTeamArticle(ctx), AI_CALL_TIMEOUT_MS);
    if (!result) {
      console.error(`[pregenerate] Team article parse failed for ${ctx.teamName}`);
      options.trace?.teamArticles.push({
        teamId: ctx.teamId,
        teamName: ctx.teamName,
        cacheHit: false,
        userPrompt,
        inputData: ctx,
        output: null,
        error: 'Parse failed (Claude returned malformed JSON)',
        durationMs: Date.now() - startedAt,
        contentHash,
      });
      options.trace?.errors.push({
        step: `team-article:${ctx.teamName}`,
        message: 'Parse failed (Claude returned malformed JSON)',
      });
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
      options.trace?.errors.push({
        step: `team-article:${ctx.teamName}:cache-write`,
        message: String(err),
      });
    }

    options.trace?.teamArticles.push({
      teamId: ctx.teamId,
      teamName: ctx.teamName,
      cacheHit: false,
      userPrompt,
      inputData: ctx,
      output: article,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: Date.now() - startedAt,
      contentHash,
    });

    return article;
  } catch (err) {
    console.error(`[pregenerate] Team article generation failed for ${ctx.teamName}:`, err);
    options.trace?.teamArticles.push({
      teamId: ctx.teamId,
      teamName: ctx.teamName,
      cacheHit: false,
      userPrompt,
      inputData: ctx,
      output: null,
      error: String(err),
      durationMs: Date.now() - startedAt,
      contentHash,
    });
    options.trace?.errors.push({
      step: `team-article:${ctx.teamName}`,
      message: String(err),
    });
    return null;
  }
}
