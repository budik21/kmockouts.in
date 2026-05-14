import { randomInt } from 'crypto';
import { queryOne } from './db';
import { LEAGUE_CODE_ALPHABET, LEAGUE_CODE_LENGTH } from './league-code';

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
 *
 * Server-only because it touches the DB; importing this file from a client
 * component drags `pg` into the browser bundle and breaks the build.
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
