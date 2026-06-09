/**
 * Builds the English AI image-generation prompt for a match infographic collage,
 * filled with the live tip-distribution data for that match.
 *
 * The output is meant to be copied into an image model (Midjourney, DALL·E,
 * Imagen, …). It describes a photorealistic 3:2 landscape social-media collage:
 * home nation on the left, away nation on the right, each with a famous national
 * landmark/monument, a national symbol and a typical dish in the background, a
 * realistic waving flag above, and a central "PREDICTION" infographic panel with
 * the most-tipped score and a home/draw/away share bar. The exact numbers the
 * model must render are also embedded as a JSON data block, so it builds the
 * graphic from explicit values rather than guessing.
 *
 * Pure and dependency-free so it can run on both the server and the client.
 */

export interface InfographicPromptInput {
  homeName: string;
  homeShort: string;
  homeCc: string;
  awayName: string;
  awayShort: string;
  awayCc: string;
  groupId: string;
  kickOff: string; // ISO 8601 (UTC), as stored
  totalTips: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  /** Most frequently tipped exact scoreline, or null when there are no tips. */
  topScore: { homeGoals: number; awayGoals: number; count: number } | null;
}

/**
 * Home/draw/away percentages, rounded so they always sum to exactly 100
 * (the away share absorbs the rounding remainder — same approach as the e-mail
 * ratio bar). Returns all zeroes when there are no tips.
 */
export function tipShares(input: {
  totalTips: number;
  homeWins: number;
  draws: number;
}): { homePct: number; drawPct: number; awayPct: number } {
  if (input.totalTips === 0) return { homePct: 0, drawPct: 0, awayPct: 0 };
  const homePct = Math.round((input.homeWins / input.totalTips) * 100);
  const drawPct = Math.round((input.draws / input.totalTips) * 100);
  const awayPct = 100 - homePct - drawPct;
  return { homePct, drawPct, awayPct };
}

/** Normalise the stored kick-off into a clean ISO-8601 UTC string for the JSON. */
function isoUtc(kickOff: string): string {
  const d = new Date(kickOff);
  return isNaN(d.getTime()) ? kickOff : d.toISOString();
}

export function buildInfographicPrompt(m: InfographicPromptInput): string {
  const { homePct, drawPct, awayPct } = tipShares(m);

  const data = {
    competition: 'FIFA World Cup 2026',
    stage: 'Group stage',
    group: m.groupId,
    kickoff_utc: isoUtc(m.kickOff),
    home: { country: m.homeName, code: m.homeCc.toUpperCase(), short: m.homeShort },
    away: { country: m.awayName, code: m.awayCc.toUpperCase(), short: m.awayShort },
    predictions: {
      total_tips: m.totalTips,
      most_tipped_score: m.topScore
        ? { home: m.topScore.homeGoals, away: m.topScore.awayGoals, count: m.topScore.count }
        : null,
      distribution: {
        home_win: { pct: homePct, count: m.homeWins },
        draw: { pct: drawPct, count: m.draws },
        away_win: { pct: awayPct, count: m.awayWins },
      },
    },
  };

  const json = JSON.stringify(data, null, 2);

  return `You are an expert visual designer. Generate ONE photorealistic promotional collage image for a football match, intended for publishing on social media.

OUTPUT FORMAT
- Aspect ratio: strictly 3:2, landscape orientation. Do not letterbox, crop or pad to change it.
- A single cohesive, high-detail, photorealistic collage — not a flat vector graphic and not a cartoon.

CONCEPT
The image celebrates an upcoming FIFA World Cup 2026 group-stage match and visualises how fans predict it will end. It is split vertically into a HOME side on the LEFT and an AWAY side on the RIGHT, with a prediction infographic floating in the centre.

LEFT SIDE — the home nation (${m.homeName})
- Background: a famous national landmark or monument of ${m.homeName}, combined with an iconic national symbol and a typical national dish, blended naturally into one realistic scene.
- A large, realistic waving flag of ${m.homeName} across the upper area.

RIGHT SIDE — the away nation (${m.awayName})
- Mirror the left side for ${m.awayName}: a famous national landmark or monument, an iconic national symbol and a typical national dish, with a large, realistic waving flag of ${m.awayName} above.

CENTER — prediction infographic (must be crisp and clearly legible)
- A badge at the top reading "PREDICTION".
- Beneath the badge, the single most-tipped final score in large, bold numerals, written as "${m.homeShort} [home]–[away] ${m.awayShort}".
- Beneath the score, a horizontal stacked bar split into three labelled segments — home win / draw / away win — sized to the three percentages and coloured to each side (home colour, neutral grey for the draw, away colour). Print each percentage on its own segment.

DATA — build every textual and numeric element STRICTLY from this JSON. Do not invent scores, dates or numbers; use exactly these values. If "most_tipped_score" is null, omit the central score and write "No clear favourite" instead.

\`\`\`json
${json}
\`\`\`

DO NOT
- Do not use any official FIFA or FIFA World Cup logo, emblem, trophy, mascot, wordmark or other branded/trademarked element.
- Do not add any score, statistic, sponsor logo or text that is not present in the JSON.
- Do not change the 3:2 aspect ratio.`;
}
