import { revalidateTag } from 'next/cache';

/**
 * Hard-expire cache tags immediately.
 *
 * In Next.js 16, `revalidateTag(tag, 'max')` is STALE-WHILE-REVALIDATE: it
 * only marks the tagged entries as stale (the 'max' profile never expires
 * them), so the next request is still SERVED THE OLD DATA while a refresh
 * runs in the background. That silently broke every mutation endpoint here:
 * the invalidate → Cloudflare-purge → warm pipeline re-rendered each page
 * exactly once right after the purge, captured the STALE pre-update render,
 * and pinned it into the Cloudflare edge cache for the whole edge TTL —
 * e.g. a team page showing the new AI article (read uncached from the DB)
 * next to a pre-update standings table and match list (read via tagged
 * `unstable_cache`).
 *
 * `{ expire: 0 }` sets `expired = now` in the cache handler, so the next
 * read blocks and recomputes — read-your-writes, which is what a mutation
 * endpoint wants. (The classic single-argument `revalidateTag(tag)` does the
 * same but is deprecated in Next 16 and logs a warning on every call;
 * `updateTag()` throws outside Server Actions, so it is unusable in our
 * route handlers.)
 */
export function expireTags(...tags: string[]): void {
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
}
