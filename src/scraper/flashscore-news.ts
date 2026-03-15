/**
 * Flashscore News Scraper
 *
 * Fetches World Cup news articles from Flashscore, extracts titles,
 * images, and links, and stores them in the database.
 */

import { getPool } from '../lib/db';

// ============================================================
// Configuration — edit these to change scraping behavior
// ============================================================

const FLASHSCORE_NEWS_URL = 'https://www.flashscore.com/news/world-cup/lvUBR5F8CdnS0XT8/';
const FLASHSCORE_BASE_URL = 'https://www.flashscore.com';
const MAX_ARTICLES = 10;
const FETCH_TIMEOUT_MS = 15000;

// ============================================================
// Types
// ============================================================

export interface NewsArticle {
  title: string;
  url: string;
  imageUrl: string;
  publishedAt: string | null; // ISO 8601 timestamp
}

// ============================================================
// Scraper
// ============================================================

/**
 * Fetch and parse news articles from the Flashscore news page.
 */
export async function scrapeFlashscoreNews(): Promise<NewsArticle[]> {
  const response = await fetch(FLASHSCORE_NEWS_URL, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'KnockoutsIn/1.0',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn(`Flashscore returned ${response.status}`);
    return [];
  }

  const html = await response.text();
  return parseArticles(html);
}

/**
 * Parse article data from the page.
 *
 * Strategy: Flashscore embeds article data (including image URLs) in JSON
 * blobs inside <script> tags. We find all "articles":[...] arrays in the
 * HTML source and extract title, url, and the 300px JPEG image variant
 * (variantType 2) from each article object.
 */
function parseArticles(html: string): NewsArticle[] {
  const seen = new Set<string>();
  const articles: NewsArticle[] = [];

  // Find all "articles":[...] JSON arrays embedded in <script> tags
  let searchFrom = 0;
  while (searchFrom < html.length) {
    const startIdx = html.indexOf('"articles":[', searchFrom);
    if (startIdx === -1) break;

    // Find the matching closing bracket
    const arrayStart = startIdx + 11; // position of '['
    let depth = 0;
    let i = arrayStart;
    for (; i < html.length; i++) {
      if (html[i] === '[') depth++;
      else if (html[i] === ']') { depth--; if (depth === 0) break; }
    }
    searchFrom = i + 1;

    let parsed: JsonArticle[];
    try {
      parsed = JSON.parse(html.substring(arrayStart, i + 1));
    } catch {
      continue;
    }

    for (const item of parsed) {
      if (!item.url || !item.title) continue;
      const url = FLASHSCORE_BASE_URL + item.url;
      if (seen.has(url)) continue;
      seen.add(url);

      // Pick the 300px JPEG variant (variantType 2), fall back to first available
      const img300 = item.images?.find((img) => img.variantType === 2);
      const imageUrl = img300?.url ?? '';

      // Convert Unix timestamp to ISO string
      const publishedAt = item.published
        ? new Date(item.published * 1000).toISOString()
        : null;

      articles.push({ title: item.title, url, imageUrl, publishedAt });
    }
  }

  return articles;
}

interface JsonArticle {
  id?: string;
  title?: string;
  url?: string;
  published?: number;
  images?: { variantType: number; url: string }[];
}

// ============================================================
// Writer
// ============================================================

/**
 * Upsert articles into the database. Keeps at most MAX_ARTICLES rows.
 */
export async function writeNewsArticles(articles: NewsArticle[]): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  let newCount = 0;

  try {
    await client.query('BEGIN');

    for (const article of articles) {
      const result = await client.query(
        `INSERT INTO news_article (external_url, title, image_url, published_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (external_url) DO UPDATE SET
           title = EXCLUDED.title,
           image_url = EXCLUDED.image_url,
           published_at = COALESCE(EXCLUDED.published_at, news_article.published_at)
         RETURNING (xmax = 0) AS is_insert`,
        [article.url, article.title, article.imageUrl, article.publishedAt]
      );
      if (result.rows[0]?.is_insert) newCount++;
    }

    // Prune old articles, keep the MAX_ARTICLES newest by published_at
    await client.query(
      `DELETE FROM news_article
       WHERE id NOT IN (
         SELECT id FROM news_article ORDER BY published_at DESC NULLS LAST, id DESC LIMIT $1
       )`,
      [MAX_ARTICLES]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return newCount;
}
