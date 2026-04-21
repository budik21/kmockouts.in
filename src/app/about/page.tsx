import type { Metadata } from 'next';
import Link from 'next/link';
import AboutClient from './AboutClient';

export const metadata: Metadata = {
  title: 'About',
  description: 'Meet Radek Budař, the builder behind Knockouts.in — a FIFA World Cup 2026 tracker built with sports, data, and vibe coding.',
  alternates: { canonical: '/about' },
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <main className="container py-5" style={{ maxWidth: 720 }}>
      <nav aria-label="breadcrumb" className="mb-4">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            About
          </li>
        </ol>
      </nav>

      <AboutClient />
    </main>
  );
}
