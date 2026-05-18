/**
 * Shared types and constants for the admin-controlled Claude model
 * selection used by the AI predictions pipeline (team articles, group
 * articles, scenario summaries, best-third summaries).
 *
 * This module is intentionally free of DB / Node-only imports so it can
 * be imported safely from client components (the admin model picker
 * needs the labels and pricing for its dropdown). Server-side reads/
 * writes of the actual setting live in `ai-model-server.ts`.
 */

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

export const AI_PREDICTION_MODEL_SETTING_KEY = 'ai_prediction_model';

export function normalizeAiPredictionModel(value: unknown): AiPredictionModelKey {
  return value === 'sonnet' || value === 'opus' ? value : 'haiku';
}
