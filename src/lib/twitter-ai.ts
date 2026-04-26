import Anthropic from '@anthropic-ai/sdk';
import { withClaudeSlot } from './claude-concurrency';
import type { PreMatchContext, PostMatchContext } from './twitter-context';

const client = new Anthropic();

const MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;

const SYSTEM_PROMPT = `You are a creative sports social-media writer for a World Cup 2026 fan site.
Your tweets are PUNCHY, CREATIVE, and frame the situation as a QUESTION whenever it makes sense.

Output exactly ONE tweet, English only.
- Hard limit: 256 characters total. Aim for 200–240. (The server appends a team-page URL; do NOT add any URL yourself.)
- Open with a HOOK QUESTION when the team is still alive ("Can CZE clinch playoff vs MEX?", "Will the miracle happen — does CZE crash USA's party?").
- Then give the concrete answer in the same tweet ("A draw is enough.", "They need a 3-goal win AND a SUI–CAN draw.").
- Use the most likely scenario from the data — do not invent stats. Reference real teams, real points, real goal difference.
- Energetic, plain language. Direct. No clickbait. No hype filler ("HUGE!!", "INSANE!!").
- Max 1 hashtag. Place at the end. Skip hashtags if they don't add value.
- No @-mentions. No URLs. No quotation marks around the tweet. No markdown. No labels ("Tweet:", "Here is...").

PRE-MATCH tweets must:
- Lead with the question framing (will/can/does the team do X?).
- Name the opponent and the upcoming match.
- State the cleanest path to advancing or being eliminated.

POST-MATCH tweets must:
- Lead with the result + what it MEANS for the playoff outlook.
- Pattern: "{Result} for {team} {score} {opponent} means {team} now needs {X} to {advance/avoid elimination}."
- If the result clinched / eliminated → say so directly, drop the question.

Examples of the desired voice:
- PRE: "Can CZE clinch playoff vs MEX? A draw is enough — and they're through. Win and they top Group A. Tuesday, kickoff 18:00 UTC."
- PRE: "Miracle time? CZE need to beat MEX by 3 AND hope SUI–CAN ends level. Anything less and the World Cup ends here."
- POST: "CZE 2–3 RSA leaves it on a knife edge: beat MEX by 3 AND pray for help, or pack the bags. R16 hopes hanging by a thread."
- POST: "Job done. CZE's 2–0 over MEX seals top spot in Group A and a Round of 16 ticket."`;

interface PromptCtx {
  team: string;
  countryCode: string;
  group: string;
  groupProgress: string;
  standings: { pos: number; team: string; played: number; pts: number; gd: number }[];
  probabilities: {
    advance_to_R16: string;
    third_place_playoff: string;
    eliminated: string;
    breakdown: { [pos: number]: string };
  };
  cachedScenarioInsights: { position: number; text: string }[];
  nextMatch?: { opponent: string; kickOff: string; round: number };
  needsHeuristic?: string;
  lastMatch?: { opponent: string; result: string; scoreLine: string; round: number };
}

function buildPromptCtx(ctx: PreMatchContext | PostMatchContext): PromptCtx {
  const base: PromptCtx = {
    team: ctx.team.name,
    countryCode: ctx.team.countryCode,
    group: ctx.group.groupId,
    groupProgress: `${ctx.group.matchesPlayed}/${ctx.group.matchesTotal} matches played`,
    standings: ctx.standings.map(s => ({
      pos: s.position,
      team: s.teamName,
      played: s.matchesPlayed,
      pts: s.points,
      gd: s.goalDifference,
    })),
    probabilities: {
      advance_to_R16: `${ctx.probabilities.advance}%`,
      third_place_playoff: `${ctx.probabilities.thirdPlay}%`,
      eliminated: `${ctx.probabilities.eliminated}%`,
      breakdown: {
        1: `${ctx.positionProbs[1] ?? 0}%`,
        2: `${ctx.positionProbs[2] ?? 0}%`,
        3: `${ctx.positionProbs[3] ?? 0}%`,
        4: `${ctx.positionProbs[4] ?? 0}%`,
      },
    },
    // Include up to 2 most-likely cached scenario summaries so the model
    // has the same authored colour the team page shows visitors.
    cachedScenarioInsights: ctx.aiSummaries
      .filter(s => (ctx.positionProbs[s.position] ?? 0) > 0)
      .sort((a, b) => (ctx.positionProbs[b.position] ?? 0) - (ctx.positionProbs[a.position] ?? 0))
      .slice(0, 2)
      .map(s => ({ position: s.position, text: s.text.slice(0, 600) })),
  };

  if (ctx.kind === 'pre') {
    base.nextMatch = {
      opponent: ctx.opponent.name,
      kickOff: ctx.nextMatch.kickOff,
      round: ctx.nextMatch.round,
    };
    base.needsHeuristic = ctx.needHint;
  } else {
    const [a, b] = ctx.scoreLineFor.split('-');
    base.lastMatch = {
      opponent: ctx.opponent.name,
      result: ctx.result,
      scoreLine: `${ctx.team.shortName} ${a}–${b} ${ctx.opponent.shortName}`,
      round: ctx.lastMatch.round,
    };
  }
  return base;
}

function trimToTweetLength(text: string, max = 256): string {
  let out = text.trim();
  if (out.startsWith('"') && out.endsWith('"')) out = out.slice(1, -1).trim();
  if (out.length <= max) return out;
  // Trim on a word boundary, leave room for an ellipsis
  const sliced = out.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > max - 40 ? sliced.slice(0, lastSpace) : sliced).trimEnd() + '…';
}

export interface ScenarioTweetUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
  model: string;
}

export async function generateScenarioTweet(
  ctx: PreMatchContext | PostMatchContext,
): Promise<{ text: string; usage: ScenarioTweetUsage }> {
  const promptCtx = buildPromptCtx(ctx);
  const userPrompt = `Generate a ${ctx.kind === 'pre' ? 'PRE-MATCH' : 'POST-MATCH'} tweet for the team below.

Open with a hook QUESTION (unless the team has clinched or been eliminated — then state it).
Then give the concrete answer using the data. No invented facts.

DATA (do not invent any other facts):
${JSON.stringify(promptCtx, null, 2)}

Write the tweet now. Output the tweet text only — no surrounding quotes, no labels.`;

  console.log(`[twitter-ai] generateScenarioTweet team=${ctx.team.name} kind=${ctx.kind} model=${MODEL}`);
  const start = Date.now();
  const response = await withClaudeSlot(() => client.messages.create({
    model: MODEL,
    max_tokens: 360,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }));
  const elapsedMs = Date.now() - start;

  const block = response.content.find(b => b.type === 'text');
  const raw = block?.text ?? '';

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK;

  console.log(`[twitter-ai] done ${elapsedMs}ms · ${inputTokens} in + ${outputTokens} out · ~$${costUsd.toFixed(5)}`);

  return {
    text: trimToTweetLength(raw),
    usage: { inputTokens, outputTokens, costUsd, elapsedMs, model: MODEL },
  };
}
