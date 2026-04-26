import { TwitterApi } from 'twitter-api-v2';
import { query, queryOne } from './db';

export type TwitterTemplate = 'simple' | 'scenario_pre' | 'scenario_post';
export type TwitterMediaKind = 'image' | 'gif';

let cachedClient: TwitterApi | null = null;

export function isTwitterConfigured(): boolean {
  return Boolean(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET,
  );
}

function getTwitterClient(): TwitterApi {
  if (!isTwitterConfigured()) {
    throw new Error('Twitter API credentials are missing. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_SECRET.');
  }
  if (!cachedClient) {
    cachedClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });
  }
  return cachedClient;
}

interface PostInput {
  text: string;
  media?: {
    buffer: Buffer;
    mimeType: 'image/png' | 'image/jpeg' | 'image/gif';
  };
}

export interface PostResult {
  tweetId: string;
  url: string;
}

export async function postTweet(input: PostInput, screenNameFallback = 'i'): Promise<PostResult> {
  const client = getTwitterClient();
  let mediaIds: [string] | undefined;

  if (input.media) {
    const mediaId = await client.v1.uploadMedia(input.media.buffer, {
      mimeType: input.media.mimeType,
    });
    mediaIds = [mediaId];
  }

  const tweet = await client.v2.tweet({
    text: input.text,
    ...(mediaIds ? { media: { media_ids: mediaIds } } : {}),
  });

  const tweetId = tweet.data.id;
  return {
    tweetId,
    url: `https://x.com/${screenNameFallback}/status/${tweetId}`,
  };
}

interface RecordTweetInput {
  tweetId: string;
  text: string;
  template: TwitterTemplate;
  mediaKind: TwitterMediaKind | null;
  teamId: number | null;
  matchId: number | null;
  postedByEmail: string;
}

export async function recordTweet(input: RecordTweetInput): Promise<void> {
  await query(
    `INSERT INTO twitter_post (tweet_id, text, template, media_kind, team_id, match_id, posted_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tweet_id) DO NOTHING`,
    [
      input.tweetId,
      input.text,
      input.template,
      input.mediaKind,
      input.teamId,
      input.matchId,
      input.postedByEmail,
    ],
  );
}

export interface TwitterPostListItem {
  id: number;
  tweetId: string;
  text: string;
  template: TwitterTemplate;
  mediaKind: TwitterMediaKind | null;
  teamId: number | null;
  teamName: string | null;
  postedByEmail: string;
  postedAt: string;
  url: string;
}

interface TwitterPostRow {
  id: number;
  tweet_id: string;
  text: string;
  template: TwitterTemplate;
  media_kind: TwitterMediaKind | null;
  team_id: number | null;
  team_name: string | null;
  posted_by_email: string;
  posted_at: string;
}

export async function listTweets(limit = 100): Promise<TwitterPostListItem[]> {
  const rows = await query<TwitterPostRow>(
    `SELECT tp.id, tp.tweet_id, tp.text, tp.template, tp.media_kind, tp.team_id,
            t.name AS team_name, tp.posted_by_email, tp.posted_at::text AS posted_at
     FROM twitter_post tp
     LEFT JOIN team t ON t.id = tp.team_id
     ORDER BY tp.posted_at DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    tweetId: r.tweet_id,
    text: r.text,
    template: r.template,
    mediaKind: r.media_kind,
    teamId: r.team_id,
    teamName: r.team_name,
    postedByEmail: r.posted_by_email,
    postedAt: r.posted_at,
    url: `https://x.com/i/status/${r.tweet_id}`,
  }));
}

export async function deleteTweetRecord(id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    'DELETE FROM twitter_post WHERE id = $1 RETURNING id',
    [id],
  );
  return rows.length > 0;
}

export async function tweetExists(tweetId: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    'SELECT id FROM twitter_post WHERE tweet_id = $1',
    [tweetId],
  );
  return !!row;
}
