import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with Knockouts.in — email support@knockouts.in or use the in-page Feedback widget.',
  alternates: { canonical: '/contact' },
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <main className="container py-4" style={{ maxWidth: 800 }}>
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Contact
          </li>
        </ol>
      </nav>

      <h1 className="mb-4">Contact</h1>

      <section className="mb-4">
        <p>
          Knockouts.in is a one-person project run by Radek Budař. The fastest way
          to reach me is by email.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">Email</h2>
        <p>
          Send any question, correction, or feedback to{' '}
          <a href="mailto:support@knockouts.in">support@knockouts.in</a>. I read
          every message personally and try to reply within a few days.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">Quick feedback</h2>
        <p>
          For short notes you don&apos;t need a reply to — typos, broken links, ideas
          — you can also use the <strong>Feedback</strong> widget at the bottom of
          any page on the site. It posts straight to my inbox without leaving the
          page you&apos;re on.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">What to write about</h2>
        <ul>
          <li>Wrong score, missing match, or a team detail that looks off.</li>
          <li>Bugs, layout issues, or anything that breaks on your device.</li>
          <li>Ideas for new features, tournaments, or AI analyses you&apos;d like to see.</li>
          <li>Press, partnership or advertising questions.</li>
          <li>Privacy or data requests covered in the{' '}
            <Link href="/privacy-policy">Privacy Policy</Link>.
          </li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="h5">About this site</h2>
        <p>
          Curious how Knockouts.in is built and how its AI-powered scenario
          analyses work? See the <Link href="/about">About</Link> page.
        </p>
      </section>
    </main>
  );
}
