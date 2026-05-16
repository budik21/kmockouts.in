export interface DisambiguatableUser {
  name: string;
  email: string;
}

/**
 * Resolve a disambiguator suffix for users who share a name on the same
 * leaderboard. For each input, returns the object plus two fields:
 *
 *   - `nameSuffix` — the bare email fragment that distinguishes this row from
 *     same-name rivals, or `null` if the name is unique within the set. The
 *     suffix is the email domain when it alone disambiguates, otherwise the
 *     local-part (text before "@"). Callers wrap and style it on render —
 *     typically as a smaller muted "(suffix)" trailing the name.
 *   - `displayName` — `name` with the suffix inlined in parentheses, suitable
 *     for plain-text contexts (title attributes, aria-labels, sort keys).
 *
 * Full e-mail addresses are never returned — only the smallest distinguishing
 * fragment. Empty/malformed e-mails on a colliding row fall back to bare name.
 */
export function disambiguateNames<T extends DisambiguatableUser>(
  users: T[],
): (T & { nameSuffix: string | null; displayName: string })[] {
  const byName = new Map<string, T[]>();
  for (const u of users) {
    const key = u.name.trim();
    const arr = byName.get(key);
    if (arr) arr.push(u);
    else byName.set(key, [u]);
  }

  return users.map((u) => {
    const group = byName.get(u.name.trim()) ?? [u];
    if (group.length <= 1) return { ...u, nameSuffix: null, displayName: u.name };

    const email = (u.email ?? '').trim();
    const atIdx = email.lastIndexOf('@');
    if (atIdx < 1 || atIdx === email.length - 1) {
      return { ...u, nameSuffix: null, displayName: u.name };
    }
    const domain = email.slice(atIdx + 1);
    const localPart = email.slice(0, atIdx);

    const sameDomainCount = group.filter((g) => {
      const e = (g.email ?? '').trim();
      const at = e.lastIndexOf('@');
      return at >= 0 && e.slice(at + 1) === domain;
    }).length;

    const suffix = sameDomainCount > 1 ? localPart : domain;
    return { ...u, nameSuffix: suffix, displayName: `${u.name} (${suffix})` };
  });
}
