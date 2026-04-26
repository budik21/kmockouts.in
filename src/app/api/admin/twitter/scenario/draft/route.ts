import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { auth } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { buildPreMatchContext, buildPostMatchContext, teamPageUrl, APPENDED_URL_WEIGHT } from '@/lib/twitter-context';
import { generateScenarioTweet } from '@/lib/twitter-ai';

export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  // requireSuperadminApi already enforces email match; double-check defensively
  const session = await auth();
  if (session?.user?.email !== SUPERADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { teamId?: unknown; kind?: unknown };
    const teamId = typeof body.teamId === 'number' ? body.teamId : Number(body.teamId);
    const kind = body.kind === 'pre' ? 'pre' : body.kind === 'post' ? 'post' : null;
    if (!Number.isFinite(teamId) || !kind) {
      return NextResponse.json({ error: 'teamId (number) and kind ("pre"|"post") are required' }, { status: 400 });
    }

    const ctx = kind === 'pre'
      ? await buildPreMatchContext(teamId)
      : await buildPostMatchContext(teamId);

    const { text } = await generateScenarioTweet(ctx);
    const teamUrl = teamPageUrl(ctx.team);
    return NextResponse.json({
      text,
      teamUrl,
      appendedUrlWeight: APPENDED_URL_WEIGHT,
      context: ctx,
    });
  } catch (err) {
    console.error('POST /api/admin/twitter/scenario/draft error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
