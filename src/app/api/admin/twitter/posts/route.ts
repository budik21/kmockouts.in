import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { listTweets, isTwitterConfigured, deleteTweetRecord } from '@/lib/twitter';

export async function GET() {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const posts = await listTweets(100);
    return NextResponse.json({
      configured: isTwitterConfigured(),
      posts,
    });
  } catch (err) {
    console.error('GET /api/admin/twitter/posts error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === 'number' ? body.id : Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'id must be a positive integer' }, { status: 400 });
    }

    const deleted = await deleteTweetRecord(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Tweet record not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/twitter/posts error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
