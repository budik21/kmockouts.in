import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Knockouts.in — rules for using our free FIFA World Cup 2026 tracker.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="container py-4" style={{ maxWidth: 800 }}>
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Terms of Service
          </li>
        </ol>
      </nav>

      <h1 className="mb-4">Terms of Service</h1>
      <p className="text-muted mb-4">Last updated: April 21, 2026</p>

      <section className="mb-4">
        <h2 className="h5">1. Acceptance of Terms</h2>
        <p>
          By accessing or using Knockouts.in (&ldquo;the website&rdquo;), you agree to be bound by these
          Terms of Service. If you do not agree, please do not use the website.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">2. Description of Service</h2>
        <p>
          Knockouts.in is a free sports information service providing FIFA World Cup 2026 data,
          including group standings, fixtures, knockout bracket, qualification probabilities,
          and a pick&apos;em prediction game. The service is provided as-is at no charge.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">3. Accuracy of Information</h2>
        <p>
          We strive to keep all data accurate and up to date, but we make no warranties about the
          completeness, accuracy, or reliability of any information on the website. Match results,
          standings, and probabilities are sourced from public data and may occasionally contain
          errors or delays. Do not rely on this website for commercial, betting, or high-stakes
          decisions.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">4. User Accounts and Predictions</h2>
        <p>
          The predictions/pick&apos;em feature requires signing in with a Google account. By signing in, you
          agree to allow us to store your predictions and display your username on public leaderboards.
          You may delete your account or predictions at any time by contacting us through the
          Feedback widget.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">5. Intellectual Property</h2>
        <p>
          The website&apos;s design, code, and original content are owned by Radek Budař. Team names,
          logos, and FIFA data remain the property of their respective owners. This website is not
          affiliated with or endorsed by FIFA.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">6. Advertising</h2>
        <p>
          The website displays advertisements via Google AdSense to support its free operation.
          Ads are shown only after you consent to cookies. For details on how advertising data
          is handled, see our <Link href="/privacy-policy">Privacy Policy</Link>.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">7. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, Knockouts.in and its operator shall not be liable
          for any direct, indirect, incidental, or consequential damages arising from your use of,
          or inability to use, the website or its content.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">8. Third-Party Links and Services</h2>
        <p>
          The website may contain links to third-party websites (e.g. FIFA.com, news sources).
          We are not responsible for the content or practices of those sites. Use them at your
          own discretion.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">9. Changes to These Terms</h2>
        <p>
          We may update these Terms of Service from time to time. Changes will be posted on this
          page with an updated date. Continued use of the website after changes constitutes
          acceptance of the updated terms.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">10. Contact</h2>
        <p>
          Questions about these terms? Email{' '}
          <a href="mailto:support@knockouts.in">support@knockouts.in</a> or use the{' '}
          Feedback widget on any page. See our <Link href="/contact">Contact</Link> page
          for more options.
        </p>
      </section>
    </main>
  );
}
