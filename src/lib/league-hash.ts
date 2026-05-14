import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-based invite-link integrity check.
 *
 * Salt is server-side secret (LEAGUE_INVITE_SALT). Without it, anyone who
 * knows the (public) league code could forge invite URLs that auto-confirm
 * the league name on the landing page; with it, the hash proves the URL was
 * minted by this server.
 *
 * 12 hex chars (48 bits) is short enough to keep URLs friendly while well
 * past brute-force feasibility for an offline attacker who never sees a
 * valid sample for a given (code, name) pair.
 */
const HASH_LENGTH = 12;

function getSalt(): string {
  const salt = process.env.LEAGUE_INVITE_SALT;
  if (!salt || salt.length < 16) {
    throw new Error(
      'LEAGUE_INVITE_SALT env var is missing or too short (need ≥16 chars). ' +
        'Set a random secret in your environment.',
    );
  }
  return salt;
}

function payload(code: string, name: string): string {
  return `${code.toUpperCase()}|${name.toLowerCase()}`;
}

export function createInviteHash(code: string, name: string): string {
  return createHmac('sha256', getSalt())
    .update(payload(code, name))
    .digest('hex')
    .slice(0, HASH_LENGTH);
}

export function verifyInviteHash(code: string, name: string, hash: string): boolean {
  if (!hash || hash.length !== HASH_LENGTH) return false;
  const expected = createInviteHash(code, name);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(hash.toLowerCase(), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isValidInviteHashFormat(hash: string): boolean {
  return /^[a-f0-9]{12}$/i.test(hash);
}
