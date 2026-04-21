import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_FIELDS = new Set([
  'notify_exact_score',
  'notify_winner_only',
  'notify_wrong_tip',
]);

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const updates: [string, boolean][] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (typeof value !== 'boolean') continue;
    updates.push([key, value]);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const setClause = updates.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const params = [session.tipsterId, ...updates.map(([, v]) => v)];

  await query(
    `UPDATE tipster_user SET ${setClause} WHERE id = $1`,
    params,
  );

  return NextResponse.json({ success: true });
}
