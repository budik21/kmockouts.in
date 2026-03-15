import { MetadataRoute } from 'next';
import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { TeamRow } from '@/lib/types';
import { slugify } from '@/lib/slugify';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://knockouts.in';

  const entries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/worldcup2026`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
  ];

  for (const groupId of ALL_GROUPS) {
    entries.push({
      url: `${baseUrl}/worldcup2026/group-${groupId.toLowerCase()}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  const teams = await query<TeamRow>('SELECT name, group_id FROM team ORDER BY id');
  for (const team of teams) {
    entries.push({
      url: `${baseUrl}/worldcup2026/group-${team.group_id.toLowerCase()}/team/${slugify(team.name)}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }

  return entries;
}
