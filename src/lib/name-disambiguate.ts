export interface DisambiguatableUser {
  name: string;
  email: string;
}

/**
 * Append a disambiguator suffix to users who share a name on the same
 * leaderboard. For each input, returns the object with an added `displayName`:
 *
 *   - "Name"                 — the name is unique within the set
 *   - "Name | domain.tld"    — another user has the same name, but a different
 *                              email domain disambiguates this user
 *   - "Name | local-part"    — even the email domain repeats within the
 *                              name collision, so the part before "@" is used
 *
 * Full e-mail addresses are never returned — only the smallest distinguishing
 * fragment. Empty/malformed e-mails on a colliding row fall back to bare name.
 */
export function disambiguateNames<T extends DisambiguatableUser>(
  users: T[],
): (T & { displayName: string })[] {
  const byName = new Map<string, T[]>();
  for (const u of users) {
    const key = u.name.trim();
    const arr = byName.get(key);
    if (arr) arr.push(u);
    else byName.set(key, [u]);
  }

  return users.map((u) => {
    const group = byName.get(u.name.trim()) ?? [u];
    if (group.length <= 1) return { ...u, displayName: u.name };

    const email = (u.email ?? '').trim();
    const atIdx = email.lastIndexOf('@');
    if (atIdx < 1 || atIdx === email.length - 1) {
      return { ...u, displayName: u.name };
    }
    const domain = email.slice(atIdx + 1);
    const localPart = email.slice(0, atIdx);

    const sameDomainCount = group.filter((g) => {
      const e = (g.email ?? '').trim();
      const at = e.lastIndexOf('@');
      return at >= 0 && e.slice(at + 1) === domain;
    }).length;

    const suffix = sameDomainCount > 1 ? localPart : domain;
    return { ...u, displayName: `${u.name} | ${suffix}` };
  });
}
