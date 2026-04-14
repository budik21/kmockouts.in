import { cachedQuery } from '@/lib/cached-db';
import type { Metadata } from 'next';
import FifaRankingClient from './FifaRankingClient';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

// Tag-based on-demand revalidation via `revalidateTag(WC_TAG)`. See cache-tags.ts.

export const metadata: Metadata = {
  title: 'FIFA Ranking 2026 — All World Cup Soccer Teams Sorted by Rank',
  description:
    'Complete FIFA ranking of all 48 FIFA World Cup 2026 soccer teams with their group, points and qualification status. Updated regularly from the official FIFA / Coca-Cola Men\'s World Ranking.',
  keywords: [
    'FIFA ranking',
    'FIFA World Cup 2026 ranking',
    'soccer ranking',
    'football ranking',
    'World Cup teams ranked',
    'FIFA Coca-Cola ranking',
  ],
  alternates: { canonical: '/worldcup2026/fifa-ranking' },
  openGraph: {
    title: 'FIFA Ranking 2026 — All World Cup Soccer Teams',
    description:
      'Complete FIFA ranking of all 48 FIFA World Cup 2026 teams with their group and qualification status.',
    url: `${SITE_URL}/worldcup2026/fifa-ranking`,
  },
};

interface RankingTeam {
  id: number;
  name: string;
  short_name: string;
  country_code: string;
  group_id: string;
  fifa_ranking: number | null;
}

export default async function FifaRankingPage() {
  const teams = await cachedQuery<RankingTeam>(
    'SELECT id, name, short_name, country_code, group_id, fifa_ranking FROM team ORDER BY fifa_ranking ASC NULLS LAST'
  );

  const logRows = await cachedQuery<{ source_date: string | null }>(
    "SELECT source_date FROM scrape_log WHERE source = 'fifa-ranking' AND source_date IS NOT NULL ORDER BY id DESC LIMIT 1"
  );
  const rankingDate = logRows[0]?.source_date ?? null;

  // Extract unique groups sorted alphabetically
  const groups = [...new Set(teams.map((t) => t.group_id))].sort();

  // BreadcrumbList for the FIFA ranking page.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/worldcup2026`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'FIFA Ranking',
        item: `${SITE_URL}/worldcup2026/fifa-ranking`,
      },
    ],
  };

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <FifaRankingClient
        teams={teams.map((t) => ({
          id: t.id,
          name: t.name,
          shortName: t.short_name,
          countryCode: t.country_code,
          groupId: t.group_id,
          fifaRanking: t.fifa_ranking,
        }))}
        groups={groups}
        rankingDate={rankingDate}
      />
    </>
  );
}
