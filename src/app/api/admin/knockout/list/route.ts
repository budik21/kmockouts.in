import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { getKnockoutMatches } from '@/lib/playoff-data';
import { isFeatureEnabled } from '@/lib/feature-flags';

/** Admin: list every knockout fixture with its resolved teams + stored result. */
export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const matches = await getKnockoutMatches();
    return NextResponse.json({ matches });
  } catch (error) {
    console.error('GET /api/admin/knockout/list error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
