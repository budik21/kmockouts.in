import { slugify } from './slugify';

/**
 * Wrap the FIRST occurrence of each team name in `html` with an anchor to
 * that team's page. Subsequent mentions are left untouched. Existing inline
 * markup (e.g. `<strong>Mexico</strong>`) is preserved — the anchor wraps
 * just the matched name, so `<strong><a>Mexico</a></strong>` is the result.
 *
 * Implementation note: longer team names are processed first so "South Korea"
 * matches before "Korea". Matched spans are temporarily replaced with sentinel
 * tokens to prevent later substitutions from re-matching inside an anchor we
 * already inserted.
 */
export function autoLinkTeams(
  html: string,
  teams: { name: string }[],
  groupId: string,
): string {
  if (!html || teams.length === 0) return html;

  const sorted = [...teams].sort((a, b) => b.name.length - a.name.length);
  const replacements: { token: string; htmlOut: string }[] = [];
  let result = html;

  for (let i = 0; i < sorted.length; i++) {
    const teamName = sorted[i].name;
    const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-boundary that also rejects letters with diacritics on either side.
    const re = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'u');

    if (!re.test(result)) continue;

    const token = `TEAMLINK${i}`;
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
