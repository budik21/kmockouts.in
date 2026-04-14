/**
 * Cache tag constants for on-demand revalidation.
 *
 * Strategy: pages that read match/team/probability data are cached
 * indefinitely (no time-based revalidate). Admin mutations invalidate
 * the relevant tag via `revalidateTag`, which purges both the Data
 * Cache (unstable_cache) and the Full Route Cache for pages that
 * consumed those tags.
 */

/** Everything under /worldcup2026/*: teams, matches, probabilities, news, FIFA ranking. */
export const WC_TAG = 'wc-data';

/** Public predictions leaderboard (depends on scored tips). */
export const LEADERBOARD_TAG = 'predictions-leaderboard';
