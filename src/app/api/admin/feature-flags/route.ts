import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { setFeatureFlag, listFeatureFlags } from '@/lib/feature-flags';

const ALLOWED_KEYS = new Set(['ai_predictions']);

export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const { key, enabled } = (await request.json()) as { key?: unknown; enabled?: unknown };
    if (typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: 'Unknown feature flag key' }, { status: 400 });
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }
    await setFeatureFlag(key, enabled);
    const flags = await listFeatureFlags();
    return NextResponse.json({ success: true, flags });
  } catch (err) {
    console.error('POST /api/admin/feature-flags error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
