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
The image celebrates an upcoming FIFA World Cup 2026 group-stage match and visualises how fans predict it will end. The home nation occupies the LEFT side, the away nation the RIGHT side, and a prediction infographic card sits in the CENTRE.

COMPOSITION — keep the centre open for the card
- The collage imagery hugs the left and right edges and flows from top to bottom along each side. Leave a clear vertical strip down the middle for the prediction card — do NOT fill the whole left/right halves edge to edge.
- Keep each side clean and uncluttered: pick only ONE famous landmark or monument plus AT MOST one more iconic element (a national animal/symbol OR a typical national dish). Do not pile up many objects — two strong elements per side, not everything at once.

LEFT SIDE — the home nation (${m.homeName})
- A large, realistic flag of ${m.homeName} waving INWARD FROM THE LEFT edge, in the upper-left area.
- One famous ${m.homeName} landmark and at most one more iconic ${m.homeName} element, arranged down the left side.

RIGHT SIDE — the away nation (${m.awayName})
- A large, realistic flag of ${m.awayName} waving INWARD FROM THE RIGHT edge, in the upper-right area.
- One famous ${m.awayName} landmark and at most one more iconic ${m.awayName} element, arranged down the right side.

CENTRE — prediction card (a clean card floating in the central strip; crisp and clearly legible)
- A badge at the top reading "PREDICTION".
- Below it, the single most-tipped final score in very large, bold numerals, written as "${m.homeShort} [home]–[away] ${m.awayShort}". This score is the dominant element of the card — make it at least 25% larger than any other text on the card.
- Directly below the score, a small pill badge reading "MOST-TIPPED RESULT · [count] OF [total] TIPS" (use most_tipped_score.count and predictions.total_tips).
- Below that, a horizontal stacked bar split into three segments sized to the three percentages. Fill each segment with a SOLID FLAT colour: a representative colour of each nation for the win segments, neutral grey for the draw. Put NO text, labels or percentages on or above the bar itself.
- Directly below the bar, a single CENTRED caption line in smaller text giving the breakdown with three-letter team abbreviations: "${m.homeShort} Wins: [home]%  ·  Draw: [draw]%  ·  ${m.awayShort} Wins: [away]%".
- Keep the card compact. Do NOT add a metadata footer strip (no separate total-tips / competition / date row) — that information already appears in the badge above.

LEGIBILITY
- The bar segments must stay readable: solid flat fills only. Do NOT fill them with flags, photos, textures or patterns, and do not print any text inside the bar.

DATA — build every textual and numeric element STRICTLY from this JSON. Do not invent scores, dates or numbers; use exactly these values. If "most_tipped_score" is null, omit the central score and the "most-tipped result" badge, and write "No clear favourite" instead.

\`\`\`json
${json}
\`\`\`

DO NOT
- Do not use any official FIFA or FIFA World Cup logo, emblem, trophy, mascot, wordmark or other branded/trademarked element.
- Do not fill the prediction bar with flags, photos or patterns — solid flat colours only.
- Do not overcrowd the sides; at most one landmark plus one other element per nation.
- Do not add any score, statistic, sponsor logo or text that is not present in the JSON.
- Do not change the 3:2 aspect ratio.`;
}
