/**
 * Centralized SEO constants and helpers used across the site.
 * Keep titles, descriptions, and Open Graph defaults in one place
 * so they can be tuned without hunting through individual pages.
 */

export const SITE_URL = 'https://knockouts.in';
export const SITE_NAME = 'Knockouts.in';
export const SITE_LOCALE = 'en_US';
export const TWITTER_HANDLE = '@knockouts_in';

/** The single tournament currently covered by the site. */
export const TOURNAMENT = {
  name: 'FIFA World Cup 2026',
  startDate: '2026-06-11',
  endDate: '2026-07-19',
  hostCountries: ['United States', 'Canada', 'Mexico'],
  organizer: {
    name: 'FIFA',
    url: 'https://www.fifa.com',
  },
} as const;

/**
 * Long-tail keywords aligned with the marketing brief: World Cup, soccer,
 * football, play-off, knockout, FIFA, ranking, bracket.
 */
export const DEFAULT_KEYWORDS = [
  'FIFA World Cup 2026',
  'World Cup 2026 bracket',
  'World Cup 2026 knockout',
  'knockout bracket',
  'play-off',
  'soccer',
  'football',
  'FIFA ranking',
  'World Cup standings',
  'World Cup qualification',
  'World Cup fixtures',
  'World Cup probabilities',
  'Canada Mexico USA 2026',
];

export const DEFAULT_DESCRIPTION =
  'Live FIFA World Cup 2026 knockout bracket, group standings, fixtures, FIFA ranking and play-off qualification probabilities for every soccer team in Canada, Mexico and USA.';

export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Knockouts.in — FIFA World Cup 2026 knockout bracket and play-off tracker',
};

/** Build an absolute URL from a path (handles leading slash). */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
