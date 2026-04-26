import Anthropic from '@anthropic-ai/sdk';
import { withClaudeSlot } from './claude-concurrency';
import type { PreMatchContext, PostMatchContext } from './twitter-context';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a sports social-media writer for a World Cup 2026 fan site.

Output exactly ONE tweet, English only.
- Hard limit: 256 characters. Aim for 200–240. (The server appends a team-page URL; do NOT add any URL yourself.)
- Direct, energetic, plain language. No clickbait.
- Max 2 hashtags total. Place them at the end.
- No @-mentions. No URLs. No quotation marks around the tweet.
- Do NOT use markdown.
- Do NOT label the output ("Tweet:", "Here is..."). Output the tweet text only.
- Use the team name verbatim as given. Do not invent stats or facts.

PRE-MATCH tweets: emphasise WHAT THE TEAM NEEDS in the upcoming match
(secure top-2, stay alive, clinch the group, hunt the best-third spot).
Mention the opponent and that the match is coming up.

POST-MATCH tweets: emphasise HOW THE PLAYOFF OUTLOOK CHANGED
(improved, took a hit, all but eliminated, sealed advancement).
Mention the score line and the opponent.`;

function ctxJsonForPrompt(ctx: PreMatchContext | PostMatchContext): string {
  if (ctx.kind === 'pre') {
    return JSON.stringify({
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
      },
      nextMatch: {
        opponent: ctx.opponent.name,
        kickOff: ctx.nextMatch.kickOff,
        round: ctx.nextMatch.round,
      },
      needsHeuristic: ctx.needHint,
    }, null, 2);
  }

  return JSON.stringify({
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
    },
    lastMatch: {
      opponent: ctx.opponent.name,
      result: ctx.result,
      scoreLine: `${ctx.team.shortName} ${ctx.scoreLineFor.split('-')[0]}–${ctx.scoreLineFor.split('-')[1]} ${ctx.opponent.shortName}`,
      round: ctx.lastMatch.round,
    },
  }, null, 2);
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

export async function generateScenarioTweet(
  ctx: PreMatchContext | PostMatchContext,
): Promise<{ text: string }> {
  const userPrompt = `Generate a ${ctx.kind === 'pre' ? 'PRE-MATCH' : 'POST-MATCH'} tweet for the team below.

DATA (do not invent any other facts):
${ctxJsonForPrompt(ctx)}

Write the tweet now. Output the tweet text only — no surrounding quotes, no labels.`;

  const response = await withClaudeSlot(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 320,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }));

  const block = response.content.find(b => b.type === 'text');
  const raw = block?.text ?? '';
  return { text: trimToTweetLength(raw) };
}
