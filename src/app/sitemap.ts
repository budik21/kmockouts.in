import { MetadataRoute } from 'next';
import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { TeamRow } from '@/lib/types';
import { slugify } from '@/lib/slugify';
import { SITE_URL } from '@/lib/seo';

// Sitemap is regenerated alongside the ISR pages.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const now = new Date();

  // Top-level + key landing pages.
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/worldcup2026`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/worldcup2026/knockout-bracket`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/worldcup2026/fixtures`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/worldcup2026/best-third-placed`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/worldcup2026/fifa-ranking`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/worldcup2026/how-to-clinch-play-off-worldcup2026`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  // Group pages.
  for (const groupId of ALL_GROUPS) {
    entries.push({
      url: `${baseUrl}/worldcup2026/group-${groupId.toLowerCase()}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  // Team pages.
  const teams = await query<TeamRow>('SELECT name, group_id FROM team ORDER BY id');
  for (const team of teams) {
    entries.push({
      url: `${baseUrl}/worldcup2026/group-${team.group_id.toLowerCase()}/team/${slugify(team.name)}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }

  return entries;
}
