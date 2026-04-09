import { Metadata } from 'next';
import Link from 'next/link';
import KnockoutBracket from '@/app/components/KnockoutBracket';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title:
    'FIFA World Cup 2026 Knockout Bracket — Round of 32 to Final',
  description:
    'Interactive FIFA World Cup 2026 knockout bracket. Track every play-off match from the Round of 32 through Round of 16, Quarterfinals, Semifinals and the Final.',
  keywords: [
    'FIFA World Cup 2026 bracket',
    'knockout bracket',
    'World Cup knockout',
    'Round of 32',
    'Round of 16',
    'play-off bracket',
    'soccer bracket',
    'football bracket',
  ],
  alternates: { canonical: '/worldcup2026/knockout-bracket' },
  openGraph: {
    title: 'FIFA World Cup 2026 Knockout Bracket',
    description:
      'Interactive knockout bracket for the FIFA World Cup 2026 — Round of 32 to the Final.',
    url: `${SITE_URL}/worldcup2026/knockout-bracket`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FIFA World Cup 2026 Knockout Bracket',
    description: 'Round of 32 to the Final — interactive World Cup 2026 bracket.',
  },
};

export default function KnockoutBracketPage() {
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
        name: 'Knockout Bracket',
        item: `${SITE_URL}/worldcup2026/knockout-bracket`,
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
            Knockout Bracket
          </li>
        </ol>
      </nav>

      <h1 className="page-title mb-1">FIFA World Cup 2026 Knockout Bracket</h1>
      <p className="text-muted mb-4">
        Round of 32 &middot; Round of 16 &middot; Quarterfinals &middot; Semifinals &middot; Final
      </p>
      <KnockoutBracket />

      {/* Keyword-rich SEO content */}
      <section className="text-muted mt-4" style={{ fontSize: '0.9rem' }}>
        <p>
          The FIFA World Cup 2026 knockout bracket determines the path each soccer team must
          take from the Round of 32 to the Final. 32 of the 48 teams advance from the group
          stage: the 12 group winners, 12 runners-up and the 8 best third-placed teams from the
          play-off ranking. Use this interactive bracket to follow every World Cup 2026
          knockout fixture and predict the road to the Final.
        </p>
      </section>
    </main>
  );
}
