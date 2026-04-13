import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.tipsterId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const tipsPublic = !!body.tipsPublic;

  await query(
    'UPDATE tipster_user SET tips_public = $1 WHERE id = $2',
    [tipsPublic, session.tipsterId],
  );

  return NextResponse.json({ tipsPublic });
}
