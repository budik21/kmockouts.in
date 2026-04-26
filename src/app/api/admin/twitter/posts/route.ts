import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { listTweets, isTwitterConfigured } from '@/lib/twitter';

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
