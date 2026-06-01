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

// maxRetries lets the SDK ride through 429s honoring the retry-after header.
// A 429 is rejected BEFORE generation, so retrying it bills nothing.
const client = new Anthropic({ maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES) || 4 });

const SYSTEM_PROMPT = `You are a football writer for a World Cup prediction website. Tone: energetic, terrace-talk meets a clued-up tactics column. Slang belongs in the headline only; the body stays readable for non-native English speakers.

JOB: Write a short article about ONE team's situation in their group, from THAT team's point of view, answering one question as directly as possible:
  → "What does MY team need to reach the Round of 32 (play-off)?"
The first two paragraphs MUST deliver that answer in plain words. If they don't, the article has failed.

ANGLE by qualification status:
- CASE A — Already through (P(1st)+P(2nd)=100%): recap how they got there, what clicked, what it means for the knockouts. Past tense for matches played.
- CASE B — Eliminated (P(4th)=100%, OR no remaining match can lift them above the line, OR 0 remaining AND bestThirdQualProb=0%): recap why they're out, which result(s) buried them. No false hope.
- CASE C — Alive with remaining matches (typical mid-group): spell out the path — what must happen in their own remaining match and, if relevant, the OTHER group match. Mention the best-third route as a secondary option if P(3rd)>0.
- CASE D — Finished 3rd, fate on cross-group best-third (0 remaining AND 0% < bestThirdQualProb < 100%): past tense for the campaign, then explain the best-third route, quote the bestThirdQualProb %, and what must still happen in OTHER groups. Reflect the confidence (90% reads very differently from 20%).

OUTPUT — return ONLY one valid JSON object, no markdown, no commentary:
{"headline":"...","lede":"...","body_html":"..."}

HEADLINE: 5–10 words, maximally creative, slang/idiom encouraged (only here). Name the team or an unmistakable nickname. No generic titles ("Team analysis", "Group A — Brazil").
  Register examples: "Brazil have one foot in the last 32" · "Win or bust for the Socceroos" · "Japan need a miracle in Atlanta" · "Job done: Germany cruise into the knockouts" · "Ghana out — and the goodbye stings".

LEDE: 1–2 sentences, 30–45 words, plain text (no HTML), plain English. State the situation and what they need (or why through/out). Standalone — usable as a search meta description.

BODY_HTML: 3–4 paragraphs, 300–450 words. Wrap each in <p>...</p>; the only other tag allowed is <strong> for a team/opponent name on first mention.
  - P1: the headline answer in concrete terms ("a draw against Croatia is enough" / "even a 2-0 win wouldn't be enough because…").
  - P2: the realistic scenarios / most plausible paths (or, CASE B, the moment it slipped). Reference the other group match when it matters.
  - P3 (only if it adds something new): best-third route, head-to-head tiebreaker, or the single most pivotal result.
  - P4 (optional): short closing — next match, what to watch.

STYLE: short sentences, simple words, active voice. Present tense for standings, future-conditional for scenarios ("a win would…"). Real team names, never IDs. All matches are at neutral venues — never "home"/"away"; use "face", "play", "meet". No double negatives ("wins or draws", not "does not lose"). No section labels ("Bottom line:", "What's at stake:").

SOURCE OF TRUTH — use ONLY the data provided; never invent, infer, or recompute. Non-negotiable:
- STANDINGS: quote each team's points, GD, GF, GA exactly as the "Current standings" block lists them. If your arithmetic disagrees with the table, the table wins.
- PROBABILITIES are exact. P(1st)=0% → can't top the group. "Already through"/"eliminated"/"guaranteed" claims must match 100%/0% exactly. Don't crown a favourite when two probabilities are close — present the race as open. Discuss the best-third route only when P(3rd)>0.
- EARLY-STAGE CAUTION — these percentages swing hard while the group has lots left to play. With ≥3 of the group's 6 matches still unplayed (e.g. only the opening round done), treat even a clear leading P(1st) as an early trend, NOT a likely outcome: soften to "well placed to top the group", "on course to go through", "favourites at this stage" — never wording that frames first place as nearly settled, and don't lean on the raw percentage as if the race is close to decided.
- SCORELINES: quote a specific score ONLY if it appears in the "Played matches" block. Never infer one from points/GD. Otherwise use qualitative words ("opening defeat", "comfortable win") — never numbers. Never predict scores for remaining matches.
- SCENARIO SUMMARIES are the source of truth for what the team needs at each position — do not contradict them.
- TIEBREAKER: when a "Tiebreaker resolution" block is present and concerns this team or a neighbour, cite its exact criterion ("edged it on head-to-head", "on FIFA ranking") — never attribute the order to "goal difference"/"goals scored" when the table shows those equal. If the block is absent, the natural sort (points → GD → goals) explains the order; no mention needed.

POSITION TENSE — the "Remaining matches in the group" block counts EVERY unplayed match in the group, not just this team's. While it lists ≥1 match the group is STILL IN PROGRESS and the final order is NOT set — even if THIS team has played all 3 of its own games (others' fixtures can still reorder it). So until that block reads "(no remaining matches)":
- NEVER use past-tense finish wording: "finished/ended up/claimed/secured/took/wrapped up Xth", "finished as runners-up", "topped the group", "finished bottom".
- Use present tense: "currently sit Xth", "currently lead on N points", "are level with Z".
- This holds even when advancement is mathematically guaranteed: write "have already done enough to reach the Round of 32 from their current 3rd-place position", not "finished third".
- Past tense IS fine for individual matches played ("opened with a 2-1 win") — only POSITION/FINAL-ORDER wording must stay present-tense.

BEST-THIRD CERTAINTY — the eight best third-placed teams are FINAL only once every match in ALL 12 groups is played (stricter than this team's group being done). The "Cross-group best-third snapshot" block says FINAL or PROVISIONAL.
- While PROVISIONAL: never say this team has "secured/guaranteed/locked in/booked/clinched" a best-third spot — even at bestThirdQualProb=100%. Use: "currently sit Xth among the third-placed teams", "would advance as a best-third if the snapshot holds", chances "strong/borderline/slim".
- When FINAL: certainty is allowed ("advance as one of the eight best third-placed teams", "missed out on a best-third spot").
- "Finished 3rd in Group X" is fine once that group's remaining-matches block is empty — only the cross-group qualification claim needs hedging. If the snapshot block is absent, don't invent a cross-group ranking.

MATCH COUNT — every team plays EXACTLY 3 group matches; played + remaining = 3, always. Count the user prompt's entries before writing. If 3 played + 0 remaining the group is OVER for this team — never write "one match left", "their next match", "still to play". Refer only to matches actually listed; never invent extra fixtures.

MATCHDAY ORDER — when this team has MORE THAN ONE match still to play, the path is NOT yet down to a single decider. Never frame a final-round scenario ("just beat X in their last game and they go through") as the immediate task while an earlier match is still unplayed — that skips a whole matchday. Walk the path through the nearer unplayed match first; reserve "last game" / "final round" decider wording for when it is the only match this team has left.`;

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
  /** Cross-group snapshot of currently-3rd-placed teams, ranked by FIFA
   *  Article 13. Lets the article describe THIS team's best-third chances
   *  in concrete snapshot terms ("currently 5th among third-placed teams")
   *  rather than as a guaranteed outcome before every group-stage match
   *  across all 12 groups has been played. */
  bestThirdSnapshot?: BestThirdSnapshotForPrompt;
}

export interface BestThirdSnapshotForPrompt {
  /** True ONLY when every group-stage match across all 12 groups is finished.
   *  The article may speak about best-third outcomes as certainties only when
   *  this flag is true. */
  isFinal: boolean;
  /** Number of groups that already have every match played (0..12). */
  groupsFullyPlayed: number;
  /** Ranked rows of currently-3rd-placed teams. */
  rows: {
    rank: number;
    groupId: string;
    teamName: string;
    points: number;
    gd: number;
    goalsFor: number;
    goalsAgainst: number;
    /** True when this team's group has played every match. */
    groupFullyPlayed: boolean;
    snapshotStatus: 'qualify' | 'eliminate';
  }[];
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

// Per-call timeout. Overridable via env so the standalone scraper (slow lane)
// can be far more patient than the web request — a high timeout lets a call
// ride through the SDK's 429 rate-limit backoff instead of being abandoned.
const AI_CALL_TIMEOUT_MS = Number(process.env.AI_CALL_TIMEOUT_MS) || 30_000;

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

/**
 * The opening verdict sentence of a scenario summary, HTML stripped. The team
 * prompt only needs the one-line verdict per position, not the full
 * multi-paragraph prose — the prose was a large chunk of the input. The
 * scenario generator always leads with the shortest possible verdict.
 */
function firstSentence(html: string): string {
  const text = stripHtml(html);
  const m = text.match(/^(.*?[.!?])(?:\s|$)/);
  return (m ? m[1] : text).trim();
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
    .map(p => `  ${p}${posLabel(p)}: ${firstSentence(ctx.granularSummariesByPosition[p])}`)
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

  // Cross-group best-third snapshot. The article uses this to describe
  // THIS team's best-third standing in concrete snapshot terms. While the
  // snapshot is PROVISIONAL (isFinal === false), the article MUST NOT
  // claim certainty even when bestThirdQualProb is 100%.
  const bestThirdBlock = ctx.bestThirdSnapshot && ctx.bestThirdSnapshot.rows.length > 0
    ? `\n\nCross-group best-third snapshot (${ctx.bestThirdSnapshot.isFinal ? 'FINAL — every group-stage match across all 12 groups has been played; the top 8 are the final qualifiers' : `PROVISIONAL — only ${ctx.bestThirdSnapshot.groupsFullyPlayed}/12 groups have all matches played; this ranking may still change`}):\n${ctx.bestThirdSnapshot.rows.map(r => {
      const gdStr = r.gd >= 0 ? `+${r.gd}` : `${r.gd}`;
      const status = r.snapshotStatus === 'qualify' ? 'would qualify' : 'would be eliminated';
      const marker = r.teamName === ctx.teamName ? '  ← THIS TEAM' : '';
      const grpState = r.groupFullyPlayed ? '' : ' (group still in progress)';
      return `  ${r.rank}. ${r.teamName} (Group ${r.groupId}) — ${r.points} pts, GD ${gdStr}, GF ${r.goalsFor}, GA ${r.goalsAgainst}${grpState} → ${status}${marker}`;
    }).join('\n')}`
    : '';

  return `Team: ${ctx.teamName} (Group ${ctx.groupId})

Current standings of the whole group (THESE NUMBERS ARE THE SOURCE OF TRUTH — quote them verbatim, never round, alter, or recompute):
${standings}${tiebreakerBlock}${bestThirdBlock}

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

  const response = await withClaudeSlot(() => withTimeout(client.messages.create({
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
  }), AI_CALL_TIMEOUT_MS));

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

  const snapshot = ctx.bestThirdSnapshot
    ? `${ctx.bestThirdSnapshot.isFinal ? 'F' : 'P'}:${ctx.bestThirdSnapshot.groupsFullyPlayed}:` +
      ctx.bestThirdSnapshot.rows.map(r => `${r.rank}=${r.teamName}/${r.groupId}/${r.points}/${r.gd}/${r.goalsFor}/${r.goalsAgainst}/${r.groupFullyPlayed ? 'F' : 'P'}/${r.snapshotStatus}`).join('|')
    : '';

  // v7: prompt now (1) carries a cross-group best-third snapshot and (2) the
  // system prompt forbids "guaranteed best-third" claims while the snapshot
  // is PROVISIONAL. Bump invalidates older articles so the next admin save
  // regenerates against the new rule.
  // v9: scenario prose in the prompt reduced to the one-line verdict per
  // position (like the group prompt). Bump forces regeneration.
  // v10: early-stage caution rule — soften "group winner" claims while ≥3 of
  // the group's 6 matches are unplayed. Bump forces regeneration.
  // v11: matchday-order rule — don't frame a final-round scenario as the
  // immediate task while an earlier match is still unplayed. Bump forces
  // regeneration.
  const str = `v11:${ctx.groupId}:${ctx.teamId}:${ctx.teamName}|${standings}|played:${played}|rem:${remaining}|${probs}|bt=${ctx.bestThirdQualProb.toFixed(1)}|<${summaries}>|tb:${tiebreaker}|bts:${snapshot}`;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Read the cached team article. Returns null while the team's group has an AI
 * job in flight (slow-lane regeneration), so pages fall back to their "no
 * predictions yet" state instead of showing the stale pre-update article. Pass
 * `{ ignorePending: true }` to bypass that gate (used by the slow-lane tip
 * e-mail dispatch, which embeds the freshly-generated article during
 * 'processing').
 */
export async function getCachedTeamArticle(
  teamId: number,
  opts: { ignorePending?: boolean } = {},
): Promise<GeneratedTeamArticle | null> {
  try {
    const rows = await query<TeamArticleRow>(
      'SELECT * FROM ai_team_article_cache WHERE team_id = $1',
      [teamId],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!opts.ignorePending) {
      const { groupHasPendingAiJob } = await import('../lib/ai-queue');
      if (await groupHasPendingAiJob(row.group_id)) return null;
    }
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
    const result = await generateTeamArticle(ctx);
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
