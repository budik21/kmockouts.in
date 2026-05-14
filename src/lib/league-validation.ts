export const LEAGUE_NAME_MIN = 6;
export const LEAGUE_NAME_MAX = 40;
export const LEAGUE_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

export interface LeagueNameValidation {
  ok: boolean;
  error?: string;
  /** Trimmed, single-spaced display form. */
  display?: string;
  /** Lowercase form for case-insensitive uniqueness lookups. */
  normalized?: string;
}

export function validateLeagueName(input: unknown): LeagueNameValidation {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Name is required.' };
  }

  // Reject control / non-printable chars before any normalization.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(input)) {
    return { ok: false, error: 'Name contains non-printable characters.' };
  }

  const display = input.trim().replace(/\s+/g, ' ');

  if (display.length < LEAGUE_NAME_MIN) {
    return { ok: false, error: `Name must be at least ${LEAGUE_NAME_MIN} characters.` };
  }
  if (display.length > LEAGUE_NAME_MAX) {
    return { ok: false, error: `Name must be at most ${LEAGUE_NAME_MAX} characters.` };
  }
  if (!LEAGUE_NAME_PATTERN.test(display)) {
    return {
      ok: false,
      error: 'Only letters (A-Z), digits, spaces, hyphens and underscores are allowed.',
    };
  }

  return {
    ok: true,
    display,
    normalized: display.toLowerCase(),
  };
}

/** Server-side per-user creation cap. Admins bypass this. */
export const LEAGUE_LIMIT_PER_USER = 3;
