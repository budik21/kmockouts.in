/**
 * Admin-controlled Claude model selection for AI predictions
 * (team articles, group articles, scenario summaries, best-third summaries).
 *
 * The selected model is stored in the `app_setting` table under key
 * `ai_prediction_model` and changeable from the admin UI. Reads are
 * cached in-process for a short TTL so hot paths don't hit Postgres.
 *
 * Twitter generation has its own per-call selector (`twitter-ai.ts`)
 * and is intentionally NOT covered by this setting — tweets are a
 * one-shot, human-supervised flow.
 */

import { query } from './db';

export type AiPredictionModelKey = 'haiku' | 'sonnet' | 'opus';

export interface AiPredictionModelInfo {
  id: string;
  label: string;
  /** USD per million input tokens (fresh, not cached). */
  inputUsdPerMtok: number;
  /** USD per million output tokens. */
  outputUsdPerMtok: number;
  /** USD per million tokens written to the prompt cache (~1.25× input). */
  cacheWriteUsdPerMtok: number;
  /** USD per million tokens read from the prompt cache (~0.1× input). */
  cacheReadUsdPerMtok: number;
}

export const AI_PREDICTION_MODELS: Record<AiPredictionModelKey, AiPredictionModelInfo> = {
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    inputUsdPerMtok: 1,
    outputUsdPerMtok: 5,
    cacheWriteUsdPerMtok: 1.25,
    cacheReadUsdPerMtok: 0.1,
  },
  sonnet: {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    inputUsdPerMtok: 3,
    outputUsdPerMtok: 15,
    cacheWriteUsdPerMtok: 3.75,
    cacheReadUsdPerMtok: 0.3,
  },
  opus: {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    inputUsdPerMtok: 15,
    outputUsdPerMtok: 75,
    cacheWriteUsdPerMtok: 18.75,
    cacheReadUsdPerMtok: 1.5,
  },
};

export const AI_PREDICTION_MODEL_KEYS: AiPredictionModelKey[] = ['haiku', 'sonnet', 'opus'];

export const DEFAULT_AI_PREDICTION_MODEL: AiPredictionModelKey = 'haiku';

export function normalizeAiPredictionModel(value: unknown): AiPredictionModelKey {
  return value === 'sonnet' || value === 'opus' ? value : 'haiku';
}

const SETTING_KEY = 'ai_prediction_model';
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
      [SETTING_KEY],
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
    [SETTING_KEY, key],
  );
  cached = null;
}

export function clearAiPredictionModelCache(): void {
  cached = null;
}
