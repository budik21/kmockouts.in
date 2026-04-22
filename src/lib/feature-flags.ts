/**
 * Feature flag runtime switches, stored in the `feature_flag` table
 * and edited via the admin UI. Values are cached in-process with a
 * short TTL so hot paths don't hit Postgres on every call.
 *
 * Writes bust the cache for the process that performed them; other
 * processes pick up the change within TTL_MS. That's acceptable for
 * this use case (seconds-level propagation).
 */

import { query } from './db';

export type FeatureFlagKey = 'ai_predictions';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
}

const TTL_MS = 30_000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function isFeatureEnabled(
  key: FeatureFlagKey,
  fallback: boolean,
): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.enabled;

  try {
    const rows = await query<{ enabled: boolean }>(
      'SELECT enabled FROM feature_flag WHERE key = $1',
      [key],
    );
    const enabled = rows.length > 0 ? rows[0].enabled : fallback;
    cache.set(key, { enabled, expiresAt: now + TTL_MS });
    return enabled;
  } catch {
    return fallback;
  }
}

export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const rows = await query<{
    key: string;
    enabled: boolean;
    description: string;
    updated_at: string;
  }>('SELECT key, enabled, description, updated_at FROM feature_flag ORDER BY key');
  return rows.map((r) => ({
    key: r.key,
    enabled: r.enabled,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}

export async function setFeatureFlag(key: string, enabled: boolean): Promise<void> {
  await query(
    `UPDATE feature_flag SET enabled = $2, updated_at = NOW() WHERE key = $1`,
    [key, enabled],
  );
  cache.delete(key);
}

export function clearFeatureFlagCache(): void {
  cache.clear();
}

/**
 * Infra-level kill switch for Claude API generation of scenario/best-third
 * summaries. Reads the AI_PREDICTIONS_ENABLED env var; only "1" or "true"
 * (case-insensitive) turn it on. Missing or any other value → off.
 *
 * This sits BEFORE the DB-backed `ai_predictions` feature flag so that
 * generation can be disabled globally per-environment (e.g. staging,
 * preview deploys) without touching the DB.
 */
export function isAiGenerationEnabledByEnv(): boolean {
  const raw = (process.env.AI_PREDICTIONS_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true';
}
