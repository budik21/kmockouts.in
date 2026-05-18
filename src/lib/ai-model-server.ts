/**
 * Server-side reader/writer for the admin-controlled Claude model
 * selection. Reads from the `app_setting` table and caches the result
 * in-process for a short TTL so hot AI-generation paths don't pay a
 * Postgres round-trip on every call.
 *
 * Importing this module pulls in `pg` via `./db`, so it MUST stay out
 * of any client component bundle. Use `./ai-model` for types/constants
 * that the admin UI needs.
 */

import { query } from './db';
import {
  AI_PREDICTION_MODELS,
  AI_PREDICTION_MODEL_SETTING_KEY,
  DEFAULT_AI_PREDICTION_MODEL,
  normalizeAiPredictionModel,
  type AiPredictionModelKey,
} from './ai-model';

const TTL_MS = 30_000;

interface CacheEntry {
  key: AiPredictionModelKey;
  expiresAt: number;
}

let cached: CacheEntry | null = null;

export async function getAiPredictionModelKey(): Promise<AiPredictionModelKey> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.key;

  try {
    const rows = await query<{ value: string }>(
      'SELECT value FROM app_setting WHERE key = $1',
      [AI_PREDICTION_MODEL_SETTING_KEY],
    );
    const key = normalizeAiPredictionModel(rows[0]?.value ?? DEFAULT_AI_PREDICTION_MODEL);
    cached = { key, expiresAt: now + TTL_MS };
    return key;
  } catch {
    return DEFAULT_AI_PREDICTION_MODEL;
  }
}

export async function getAiPredictionModelId(): Promise<string> {
  const key = await getAiPredictionModelKey();
  return AI_PREDICTION_MODELS[key].id;
}

export async function setAiPredictionModel(key: AiPredictionModelKey): Promise<void> {
  await query(
    `INSERT INTO app_setting (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [AI_PREDICTION_MODEL_SETTING_KEY, key],
  );
  cached = null;
}

export function clearAiPredictionModelCache(): void {
  cached = null;
}
