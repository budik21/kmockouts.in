import { cachedQuery } from '@/lib/cached-db';
import Link from 'next/link';
import type { Metadata } from 'next';
import FixturesCalendar, { type FixtureItem } from '@/app/components/FixturesCalendar';
import Countdown from '@/app/components/Countdown';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

// Opt out of build-time static prerendering. Without this, Next.js renders
// the page during `next build` using whatever match data exists then and
// serves that stale HTML after deploy until a `revalidateTag(WC_TAG)` fires.
// The underlying queries still use tag-based `unstable_cache`, so per-request
// DB load is unchanged.
export const dynamic = 'force-dynamic';

// Tag-based on-demand revalidation via `revalidateTag(WC_TAG)`. See cache-tags.ts.

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 Fixtures, Results & Schedule',
  description:
    'Complete schedule and live results for every FIFA World Cup 2026 group stage soccer match. Kick-off times, venues, scores and play-off implications for all 48 teams.',
  keywords: [
    'FIFA World Cup 2026 fixtures',
    'World Cup 2026 schedule',
    'World Cup results',
    'soccer fixtures',
    'football fixtures',
    'World Cup kick-off times',
  ],
  alternates: { canonical: '/worldcup2026/fixtures' },
  openGraph: {
    title: 'FIFA World Cup 2026 Fixtures, Results & Schedule',
    description:
      'Every group stage match of the FIFA World Cup 2026 with kick-off times, venues and live results.',
    url: `${SITE_URL}/worldcup2026/fixtures`,
  },
};

interface FixtureRow {
  id: number;
  group_id: string;
  round: number;
  home_goals: number | null;
  away_goals: number | null;
  venue: string;
  kick_off: string;
  status: string;
  home_name: string;
  home_short: string;
  home_cc: string;
  away_name: string;
  away_short: string;
  away_cc: string;
}

export default async function FixturesPage() {
  const rows = await cachedQuery<FixtureRow>(`
    SELECT m.id, m.group_id, m.round,
      m.home_goals, m.away_goals, m.venue, m.kick_off, m.status,
      ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
      at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc
    FROM match m
    JOIN team ht ON m.home_team_id = ht.id
    JOIN team at2 ON m.away_team_id = at2.id
    ORDER BY m.kick_off, m.group_id, m.id
  `);

  // Rows arrive sorted by kickoff (SQL ORDER BY). Grouping into day sections —
  // and formatting kickoff times — happens client-side in the visitor's local
  // timezone; see FixturesCalendar.
  const fixtures: FixtureItem[] = rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    venue: r.venue,
    kickOff: r.kick_off,
    status: r.status,
    homeTeam: { name: r.home_name, shortName: r.home_short, countryCode: r.home_cc },
    awayTeam: { name: r.away_name, shortName: r.away_short, countryCode: r.away_cc },
  }));

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
        name: 'Fixtures',
        item: `${SITE_URL}/worldcup2026/fixtures`,
      },
    ],
  };

  return (
    <main className="container py-4">
      <JsonLd data={breadcrumbJsonLd} />

      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Fixtures
          </li>
        </ol>
      </nav>

      <div className="d-flex align-items-center flex-wrap gap-3 mb-1">
        <h1 className="mb-0">FIFA World Cup 2026 Fixtures &amp; Results</h1>
        <Countdown />
      </div>
      <p className="text-muted mb-4">
        Complete schedule of all group stage matches &bull; kick-off times, venues and live scores
      </p>

      <FixturesCalendar fixtures={fixtures} />
    </main>
  );
}
