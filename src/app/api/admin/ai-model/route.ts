import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireSuperadminApi } from '@/lib/admin-auth';
import {
  AI_PREDICTION_MODEL_KEYS,
  getAiPredictionModelKey,
  normalizeAiPredictionModel,
  setAiPredictionModel,
} from '@/lib/ai-model';
import { WC_TAG } from '@/lib/cache-tags';

export async function GET() {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  const key = await getAiPredictionModelKey();
  return NextResponse.json({ model: key });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as { model?: unknown };
    if (typeof body.model !== 'string' || !AI_PREDICTION_MODEL_KEYS.includes(body.model as never)) {
      return NextResponse.json(
        { error: `model must be one of: ${AI_PREDICTION_MODEL_KEYS.join(', ')}` },
        { status: 400 },
      );
    }
    const key = normalizeAiPredictionModel(body.model);
    await setAiPredictionModel(key);

    // The model choice doesn't change what's already in cache, but downstream
    // generation will use the new model on the next call. Bust the WC tag
    // mostly to keep admin dashboard reads fresh.
    revalidateTag(WC_TAG, 'max');

    return NextResponse.json({ success: true, model: key });
  } catch (err) {
    console.error('POST /api/admin/ai-model error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
