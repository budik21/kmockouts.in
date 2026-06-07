/**
 * Maps an ISO 3166-1 alpha-2 country code (the `team.country_code` column) to a
 * single significant colour taken from that nation's flag. Used to colour the
 * home/away segments of the tip-distribution bar in the daily summary e-mail.
 *
 * The curated map covers the nations likely to appear at WC 2026; anything not
 * listed falls back to a deterministic palette colour derived from the code, so
 * every team still gets a stable, distinct colour.
 */

// Significant flag colour per ISO-2 country code (upper-case keys).
const FLAG_COLORS: Record<string, string> = {
  AR: '#75AADB', // Argentina — celeste
  BR: '#009C3B', // Brazil — green
  FR: '#0055A4', // France — blue
  DE: '#DD0000', // Germany — red
  ES: '#AA151B', // Spain — red
  EN: '#CF142B', // England — red cross
  GB: '#CF142B', // Great Britain — red
  PT: '#006600', // Portugal — green
  NL: '#FF6C00', // Netherlands — orange
  BE: '#FDDA24', // Belgium — yellow
  IT: '#008C45', // Italy — green
  HR: '#C8102E', // Croatia — red
  US: '#3C3B6E', // USA — blue
  MX: '#006847', // Mexico — green
  CA: '#D80621', // Canada — red
  JP: '#BC002D', // Japan — red disc
  KR: '#CD2E3A', // South Korea — red
  AU: '#00843D', // Australia — green
  MA: '#C1272D', // Morocco — red
  SN: '#00853F', // Senegal — green
  GH: '#CE1126', // Ghana — red
  NG: '#008751', // Nigeria — green
  CM: '#007A5E', // Cameroon — green
  EG: '#CE1126', // Egypt — red
  TN: '#E70013', // Tunisia — red
  DZ: '#006233', // Algeria — green
  CI: '#FF8200', // Ivory Coast — orange
  UY: '#4267B2', // Uruguay — blue
  CO: '#FCD116', // Colombia — yellow
  EC: '#FFD100', // Ecuador — yellow
  PE: '#D91023', // Peru — red
  CL: '#0039A6', // Chile — blue
  PY: '#D52B1E', // Paraguay — red
  CR: '#002B7F', // Costa Rica — blue
  PA: '#DA121A', // Panama — red
  CH: '#FF0000', // Switzerland — red
  PL: '#DC143C', // Poland — crimson
  DK: '#C8102E', // Denmark — red
  SE: '#006AA7', // Sweden — blue
  NO: '#BA0C2F', // Norway — red
  RS: '#C6363C', // Serbia — red
  AT: '#ED2939', // Austria — red
  TR: '#E30A17', // Turkey — red
  SA: '#006C35', // Saudi Arabia — green
  IR: '#239F40', // Iran — green
  QA: '#8A1538', // Qatar — maroon
  JO: '#007A3D', // Jordan — green
  UZ: '#0099B5', // Uzbekistan — teal
  NZ: '#00247D', // New Zealand — blue
};

// Fallback palette — visually distinct, used when a code is missing above.
const FALLBACK_PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
];

export const DRAW_COLOR = '#9ca3af'; // neutral grey for the draw segment

function fallbackColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

/** Significant flag colour for a country code (case-insensitive). */
export function flagColor(countryCode: string | null | undefined): string {
  const code = (countryCode ?? '').trim().toUpperCase();
  if (!code) return fallbackColor('');
  return FLAG_COLORS[code] ?? fallbackColor(code);
}

/**
 * Returns home/away colours guaranteed to differ. If both nations share the
 * same signature colour, the away side is shifted to a contrasting fallback so
 * the two bar segments never blend together.
 */
export function matchColors(
  homeCc: string | null | undefined,
  awayCc: string | null | undefined,
): { home: string; away: string } {
  const home = flagColor(homeCc);
  let away = flagColor(awayCc);
  if (away.toLowerCase() === home.toLowerCase()) {
    away = FALLBACK_PALETTE.find((c) => c.toLowerCase() !== home.toLowerCase()) ?? '#1f2937';
  }
  return { home, away };
}
