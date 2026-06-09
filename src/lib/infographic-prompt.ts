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
- This is a genuine blended collage: the flag, the landmark and the scenery on each side melt and bleed into one another and into a shared background with soft transitions, gradients and overlaps. It must NOT look like flat rectangular photos placed side by side or hard-edged cut-outs — no visible photo boxes or seams.
- The collage imagery hugs the left and right edges and flows from top to bottom along each side. Keep the centre — and especially the lower-central area where the prediction card sits — relatively open; do NOT fill the whole left/right halves edge to edge.
- Keep each side clean and uncluttered: pick only ONE famous landmark or monument plus AT MOST one more element — a striking natural scenery of that country, or (only if it is truly iconic for that nation) an animal. Do NOT include any national dish or food. Two strong elements per side at most, not everything at once.

LEFT SIDE — the home nation (${m.homeName})
- A large, realistic flag of ${m.homeName} waving INWARD FROM THE LEFT edge (hoisted on the left, flowing toward the centre), in the upper-left area.
- One famous ${m.homeName} landmark and, at most, one striking ${m.homeName} natural scenery (or an animal only if truly iconic for ${m.homeName}), arranged down the left side. No food.

RIGHT SIDE — the away nation (${m.awayName})
- A large, realistic flag of ${m.awayName} in the upper-right area, anchored at the RIGHT edge and waving inward toward the centre. Mirror the flag horizontally so it is hoisted on the RIGHT and flows left — keep the flag's design/colours correct, just flipped; it must NOT look like a normal left-hoisted flag merely shoved to the right.
- One famous ${m.awayName} landmark and, at most, one striking ${m.awayName} natural scenery (or an animal only if truly iconic for ${m.awayName}), arranged down the right side. No food.

CENTRE — prediction card (clean, crisp and clearly legible)
- Position & size: horizontally centred and anchored to the BOTTOM edge of the image, as if the card rises up out of the bottom edge. Give it a subtle three-dimensional "plastic" relief — soft depth and a gentle shadow — so it reads as emerging from the bottom. Make the card generous: about one third larger in BOTH width and height than a minimal label would be.
- A badge at the top reading "PREDICTION".
- The score row is the dominant element: the two teams as SMALL three-letter abbreviations flanking a large central score — "${m.homeShort}" on the left, the score "[home]–[away]" big in the middle, "${m.awayShort}" on the right. Directly ABOVE each abbreviation, centred over it, place a tiny flat-style (simplified) national flag icon. Render the central score numerals much larger (at least 25% larger than any other text on the card) and in a DISTINCT accent colour, clearly different from the colour of the team abbreviations.
- Directly below the score row, a small pill badge reading "MOST-TIPPED RESULT · [count] OUT OF [total] TIPS" (use most_tipped_score.count and predictions.total_tips).
- Below that, a horizontal stacked bar split into three segments sized to the three percentages. Fill each segment with a SOLID FLAT colour: a representative colour of each nation for the win segments, and a LIGHT / pale grey for the draw (clearly lighter than a mid grey). Put NO text, labels or percentages on or above the bar itself.
- Directly below the bar, a single CENTRED caption line in smaller text with three-letter team abbreviations: "${m.homeShort} Wins: [home]%  ·  Draw: [draw]%  ·  ${m.awayShort} Wins: [away]%".
- Otherwise keep the card tidy. Do NOT add a metadata footer strip (no separate total-tips / competition / date row) — that information already appears in the badge above.

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
- Do not include any food, dishes or meals.
- Do not arrange the imagery as flat rectangular photos, hard-edged cut-outs or a boxed photo montage — the flag must blend into the background as one seamless collage.
- For the away (right-side) flag, do not show a normal left-hoisted flag — it must be mirrored to hoist from the right.
- Do not add any score, statistic, sponsor logo or text that is not present in the JSON.
- Do not change the 3:2 aspect ratio.`;
}
