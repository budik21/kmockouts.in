import { unstable_cache } from 'next/cache';
import { QueryResultRow } from 'pg';
import { query } from './db';
import { WC_TAG } from './cache-tags';

/**
 * Cached variant of `query()` for use in RSC pages.
 *
 * Wraps an arbitrary SQL query + params in `unstable_cache` and tags it
 * so that `revalidateTag(tag)` on a mutation endpoint invalidates the
 * cached result (and the Full Route Cache of pages that rendered with it).
 *
 * Cache key is derived from `sql` + `JSON.stringify(params)`, so different
 * params (e.g. per groupId) produce distinct cache entries.
 *
 * Use `query()` (not this) inside mutation endpoints and non-RSC paths.
 */
export function cachedQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  tags: string[] = [WC_TAG],
): Promise<T[]> {
  const paramsKey = JSON.stringify(params);
  return unstable_cache(
    async () => query<T>(sql, params),
    ['cached-query', sql, paramsKey, tags.join('|')],
    { tags },
  )();
}
