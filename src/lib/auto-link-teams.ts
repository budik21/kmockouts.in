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

  for (let i = 0; i < sorted.length; i++) {
    const teamName = sorted[i].name;
    if (excludeTeamName && teamName === excludeTeamName) continue;

    const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-boundary that also rejects letters with diacritics on either side.
    const re = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'gu');

    if (!re.test(result)) continue;

    const token = `\x00TEAMLINK${i}\x00`;
    result = result.replace(re, token);

    const slug = slugify(teamName);
    const href = `/worldcup2026/group-${groupId.toLowerCase()}/team/${slug}`;
    replacements.push({
      token,
      htmlOut: `<a class="team-link" href="${href}">${teamName}</a>`,
    });
  }

  for (const r of replacements) {
    result = result.split(r.token).join(r.htmlOut);
  }

  return result;
}
