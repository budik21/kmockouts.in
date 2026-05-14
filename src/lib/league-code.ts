/**
 * Browser-safe shared constants and pure helpers for league codes.
 *
 * Server-only generation lives in `league-code-server.ts` so that client
 * components can import the alphabet/validators without pulling `pg` into
 * the browser bundle.
 */

/**
 * Alphabet for invite codes: uppercase A-Z + 2-9, minus visually
 * ambiguous glyphs (O/0, I/1, L). 30 distinct symbols → 30^6 ≈ 729M
 * combinations, plenty for collision safety with retry-on-conflict.
 */
export const LEAGUE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LEAGUE_CODE_LENGTH = 6;

const LEAGUE_CODE_REGEX = new RegExp(`^[${LEAGUE_CODE_ALPHABET}]{${LEAGUE_CODE_LENGTH}}$`);

export function isValidLeagueCode(code: string): boolean {
  return LEAGUE_CODE_REGEX.test(code);
}

/** Normalize user-typed input: trim + uppercase. */
export function normalizeLeagueCode(input: string): string {
  return input.trim().toUpperCase();
}
