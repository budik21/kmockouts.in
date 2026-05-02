import { slugify } from './slugify';

/**
 * Wrap EVERY occurrence of each team name in `html` with an anchor to that
 * team's page. Existing inline markup (e.g. `<strong>Mexico</strong>`) is
 * preserved — the anchor wraps just the matched name, so
 * `<strong><a>Mexico</a></strong>` is the result.
 *
 * Pass `excludeTeamName` to skip linking that team entirely (used on the team
 * detail page so we don't link the page back to itself).
 *
 * Implementation note: longer team names are processed first so "South Korea"
 * matches before "Korea". Each team's matches are replaced with a sentinel
 * token in pass 1; pass 2 swaps sentinels for the actual anchor HTML so we
 * never accidentally re-match inside an anchor we already inserted.
 */
export function autoLinkTeams(
  html: string,
  teams: { name: string }[],
  groupId: string,
  excludeTeamName?: string,
): string {
  if (!html || teams.length === 0) return html;

  const sorted = [...teams].sort((a, b) => b.name.length - a.name.length);
  const replacements: { token: string; htmlOut: string }[] = [];
  let result = html;
  let tokenCounter = 0;

  for (const t of sorted) {
    const teamName = t.name;
    if (excludeTeamName && teamName === excludeTeamName) continue;

    const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-boundary that also rejects letters with diacritics on either side.
    const re = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'gu');

    const slug = slugify(teamName);
    const href = `/worldcup2026/group-${groupId.toLowerCase()}/team/${slug}`;

    let occurrenceIdx = 0;
    // Replace every match with a sentinel token so shorter team names in a
    // later iteration cannot re-match this team's text. Only every third
    // occurrence (the 1st, 4th, 7th, ...) renders as an anchor; the rest
    // emit the plain team name.
    result = result.replace(re, () => {
      const idx = occurrenceIdx++;
      const token = `\x00TT${tokenCounter++}\x00`;
      const linkable = idx % 3 === 0;
      replacements.push({
        token,
        htmlOut: linkable
          ? `<a class="team-link" href="${href}">${teamName}</a>`
          : teamName,
      });
      return token;
    });
  }

  for (const r of replacements) {
    result = result.split(r.token).join(r.htmlOut);
  }

  return result;
}
