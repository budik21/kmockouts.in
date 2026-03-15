import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface NewsRow {
  id: number;
  external_url: string;
  title: string;
  image_url: string;
  published_at: string | null;
}

export async function GET() {
  try {
    const rows = await query<NewsRow>(
      'SELECT id, external_url, title, image_url, published_at FROM news_article ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 10'
    );

    const articles = rows.map((r) => ({
      title: r.title,
      url: r.external_url,
      imageUrl: r.image_url,
      publishedAt: r.published_at,
    }));

    return NextResponse.json(articles);
  } catch (error) {
    console.error('Failed to fetch news:', error);
    return NextResponse.json([], { status: 500 });
  }
}
