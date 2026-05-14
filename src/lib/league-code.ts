import { randomInt } from 'crypto';
import { queryOne } from './db';

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

function generateRandomCode(): string {
  let code = '';
  for (let i = 0; i < LEAGUE_CODE_LENGTH; i++) {
    code += LEAGUE_CODE_ALPHABET[randomInt(0, LEAGUE_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Generate a fresh league code, retrying on collision against pickem_league.code.
 * Throws after 20 attempts to avoid runaway loops if the table is somehow saturated.
 */
export async function generateUniqueLeagueCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateRandomCode();
    const existing = await queryOne<{ code: string }>(
      'SELECT code FROM pickem_league WHERE code = $1',
      [code],
    );
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique league code after 20 attempts');
}
