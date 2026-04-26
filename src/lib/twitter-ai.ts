import Anthropic from '@anthropic-ai/sdk';
import { withClaudeSlot } from './claude-concurrency';
import type { PreMatchContext, PostMatchContext } from './twitter-context';

const client = new Anthropic();

const MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;

const SYSTEM_PROMPT = `You are a creative sports social-media writer for a World Cup 2026 fan site.
Your tweets are PUNCHY, SPECIFIC, and frame the situation as a QUESTION whenever it makes sense.

Output exactly ONE tweet, English only.
- Hard limit: 256 characters total. Aim for 200–240. (The server appends a team-page URL; do NOT add any URL yourself.)
- Open with a HOOK QUESTION when the team is still alive ("Can CZE clinch playoff vs MEX?", "Will the miracle happen — does CZE crash USA's party?").
- Then give the concrete answer in the same tweet ("A draw is enough.", "They need a 3-goal win AND a SUI–CAN draw.").
- The tweet MUST accent the mostLikelyScenario from the data and include its exact probability percentage.
- Use the supplied scenario summary to explain WHY that scenario is most likely. Prefer concrete conditions, real teams, points, scorelines, or GD if present in the data.
- Do not hide behind generic phrases like "anything can happen", "it all comes down to", "still alive", or "must perform". Be concrete.
- Do not use telegraphic labels like "Most likely: 1st place at 60.2%". Write a natural sentence with the team name: "Brazil most likely finish 1st (60.2%)..." or "Brazil's most likely finish is 1st place at 60.2%...".
- Do not invent stats. Reference real teams, real points, real goal difference only when they appear in the data.
- Energetic, plain language. Direct. No clickbait. No hype filler ("HUGE!!", "INSANE!!").
- Max 1 hashtag. Place at the end. Skip hashtags if they don't add value.
- No @-mentions. No URLs. No quotation marks around the tweet. No markdown. No labels ("Tweet:", "Here is...").
- NEVER write "Round of 16" or "R16". The first knockout round at WC 2026 is the Round of 32 (32 of 48 teams advance). Always refer to the knockout target as "Round of 32", "play-off" or "knockouts".

PRE-MATCH tweets must:
- ALWAYS open by naming the matchup first: who plays whom, which match it is in the group, and (when known) the date / kickoff.
  Pattern: "{Team} will face {Opponent} in the {1st|2nd|final} match of Group {X}, {kickoff} {UTC}…"
  (For round 1 use "opening match", round 2 "second match", round 3 "final match".)
- THEN deliver the key message in 1 short sentence:
  - if the team is alive: name the team, the most likely finish and its probability in a natural sentence ("Brazil's most likely finish is 2nd place at 42.1%") + the cleanest path ("A draw is enough." / "Need a 3-goal win AND a SUI–CAN draw.")
  - if the team is already eliminated: state plainly that the World Cup is over for them mathematically — no question framing.
- Do NOT add a closing summary sentence that just restates the situation ("but it's too late", "the dream ends here"). Stop after the key message.
- Do NOT invent venues. Only mention a venue if it is in the data.

POST-MATCH tweets must:
- Lead with the result + what it MEANS for the playoff outlook.
- Pattern: "{Result} for {team} {score} {opponent} means {team} now needs {X} to {advance/avoid elimination}."
- Include the most likely finish and its exact probability unless the result has already clinched/eliminated the team.
- If the result clinched / eliminated → say so directly, drop the question.

Examples of the desired voice:
- PRE (alive): "Czech Republic face Mexico in Group A's final match, Tue 18:00 UTC. CZE's most likely finish is 2nd place (46.2%) — a draw keeps the play-off path clean."
- PRE (miracle): "Czech Republic face Mexico in Group A's final match, Tue 18:00 UTC. CZE most likely go out (61.4%), unless they win by 3 and SUI–CAN ends level."
- PRE (eliminated): "Canada face Switzerland in the final match of Group B, Wed 19:00 UTC. The World Cup is already over for them — the Round of 32 is mathematically out of reach."
- POST: "CZE 2–3 RSA leaves 3rd place as the most likely finish at 52.7%. Beat MEX and watch the best-third table — the play-off route is narrow."
- POST: "Job done. CZE's 2–0 over MEX seals top spot in Group A and a Round of 32 ticket."`;

interface PromptCtx {
  team: string;
  countryCode: string;
  group: string;
  groupProgress: string;
  standings: { pos: number; team: string; played: number; pts: number; gd: number }[];
  probabilities: {
    advance_to_R32: string;
    third_place_playoff: string;
    eliminated: string;
    breakdown: { [pos: number]: string };
  };
  mostLikelyScenario: {
    position: number;
    label: string;
    probability: string;
    qualificationMeaning: string;
    summary: string | null;
  };
  cachedScenarioInsights: { position: number; text: string }[];
  nextMatch?: { opponent: string; kickOff: string; round: number };
  needsHeuristic?: string;
  lastMatch?: { opponent: string; result: string; scoreLine: string; round: number };
}

function formatPct(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

function positionLabel(position: number): string {
  if (position === 1) return '1st place';
  if (position === 2) return '2nd place';
  if (position === 3) return '3rd place';
  if (position === 4) return '4th place';
  return `${position}th place`;
}

function qualificationMeaning(position: number, ctx: PreMatchContext | PostMatchContext): string {
  if (position === 1 || position === 2) return 'direct Round of 32 qualification';
  if (position === 3) {
    return ctx.probabilities.thirdPlay > 0
      ? 'best-third route to the Round of 32'
      : 'third place without a guaranteed play-off route';
  }
  return 'elimination';
}

function mostLikelyPosition(ctx: PreMatchContext | PostMatchContext): number {
  return [1, 2, 3, 4].reduce((best, pos) => {
    const current = ctx.positionProbs[pos] ?? 0;
    const bestValue = ctx.positionProbs[best] ?? 0;
    return current > bestValue ? pos : best;
  }, 1);
}

function buildPromptCtx(ctx: PreMatchContext | PostMatchContext): PromptCtx {
  const likelyPosition = mostLikelyPosition(ctx);
  const likelySummary = ctx.aiSummaries.find(s => s.position === likelyPosition)?.text ?? null;
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
      advance_to_R32: formatPct(ctx.probabilities.advance),
      third_place_playoff: formatPct(ctx.probabilities.thirdPlay),
      eliminated: formatPct(ctx.probabilities.eliminated),
      breakdown: {
        1: formatPct(ctx.positionProbs[1] ?? 0),
        2: formatPct(ctx.positionProbs[2] ?? 0),
        3: formatPct(ctx.positionProbs[3] ?? 0),
        4: formatPct(ctx.positionProbs[4] ?? 0),
      },
    },
    mostLikelyScenario: {
      position: likelyPosition,
      label: positionLabel(likelyPosition),
      probability: formatPct(ctx.positionProbs[likelyPosition] ?? 0),
      qualificationMeaning: qualificationMeaning(likelyPosition, ctx),
      summary: likelySummary ? likelySummary.slice(0, 700) : null,
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

Use mostLikelyScenario as the spine of the tweet:
- Mention the team, its label and exact probability in a natural sentence: ${promptCtx.team} / ${promptCtx.mostLikelyScenario.label} / ${promptCtx.mostLikelyScenario.probability}.
- Avoid the literal phrase "Most likely:".
- Use its summary/conditions if supplied; if not, use standings + probabilities.
- Keep it specific. No invented facts.

Open with a hook QUESTION only when it helps and the team has not clinched or been eliminated.

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
