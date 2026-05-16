/**
 * Append "(N)" — where N is the team's FIFA world ranking — to a team's
 * display label. Used everywhere a team name shows up in the Pick'em UI
 * so users see how a country ranks alongside its name. Falls back to the
 * bare name if the team has no recorded FIFA ranking (yet).
 *
 * The rank suffix is intentionally rendered in the same font and weight
 * as the name — no muting, no smaller size — so callers can drop the
 * result into a single `<span>` without extra markup.
 */
export function teamLabel(
  name: string,
  fifaRanking: number | null | undefined,
): string {
  return fifaRanking != null ? `${name} (${fifaRanking})` : name;
}
