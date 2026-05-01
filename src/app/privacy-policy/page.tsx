import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Knockouts.in — how we handle cookies, analytics, and advertising.',
  alternates: { canonical: '/privacy-policy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="container py-4" style={{ maxWidth: 800 }}>
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Privacy Policy
          </li>
        </ol>
      </nav>

      <h1 className="mb-4">Privacy Policy</h1>
      <p className="text-muted mb-4">Last updated: April 10, 2026</p>

      <section className="mb-4">
        <h2 className="h5">1. Introduction</h2>
        <p>
          Knockouts.in (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the website&rdquo;) is a free sports
          information service that tracks FIFA World Cup 2026 group standings, fixtures, knockout bracket
          and qualification probabilities. This Privacy Policy explains how we collect, use, and protect
          information when you visit our website at{' '}
          <a href={SITE_URL}>{SITE_URL}</a>.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">2. Information We Collect</h2>
        <p>We do not collect any personal information directly (no registration, login, or forms that store personal data). However, our third-party services may collect the following:</p>
        <ul>
          <li><strong>Usage data</strong> &mdash; pages visited, time on site, referral source, browser type, device type, screen resolution</li>
          <li><strong>IP address</strong> &mdash; used for approximate geolocation (country/region level) by analytics and advertising services</li>
          <li><strong>Cookies and similar technologies</strong> &mdash; small text files stored on your device (see Section 4)</li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="h5">3. How We Use Information</h2>
        <p>The information collected through third-party services is used to:</p>
        <ul>
          <li>Understand how visitors use the website (traffic analytics)</li>
          <li>Display relevant advertisements to support the free operation of the website</li>
          <li>Improve website performance and user experience</li>
        </ul>
      </section>

      <section className="mb-4">
        <h2 className="h5">4. Cookies and Third-Party Services</h2>

        <h3 className="h6 mt-3">Google Analytics</h3>
        <p>
          We use Google Analytics 4 (GA4) to analyze website traffic. Google Analytics uses cookies to
          collect anonymous usage data. This service is activated only after you consent to cookies.
          For more information, see{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google&apos;s Privacy Policy
          </a>.
        </p>

        <h3 className="h6 mt-3">Google AdSense</h3>
        <p>
          We use Google AdSense to display advertisements. Google AdSense may use cookies and web beacons
          to serve ads based on your prior visits to this website or other websites. Google&apos;s use of
          advertising cookies enables it and its partners to serve ads based on your visit to this site
          and/or other sites on the Internet.
        </p>
        <p>
          For visitors in the European Economic Area (EEA), United Kingdom, and Switzerland, a Google-certified
          Consent Management Platform (CMP) is used to obtain consent before personalized ads are shown. You
          may opt out of personalized advertising by visiting{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
            Google Ads Settings
          </a>{' '}
          or{' '}
          <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
            www.aboutads.info
          </a>.
        </p>

        <h3 className="h6 mt-3">PayPal</h3>
        <p>
          Our website includes a PayPal donation button. If you choose to donate, you will be redirected
          to PayPal&apos;s website, which is governed by{' '}
          <a href="https://www.paypal.com/webapps/mpp/ua/privacy-full" target="_blank" rel="noopener noreferrer">
            PayPal&apos;s Privacy Policy
          </a>.
          We do not receive or store your payment details.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">5. Managing Cookies</h2>
        <p>
          When you first visit the website, you are presented with a cookie consent banner. You can
          accept or decline cookies at that time. Additionally, you can manage or delete cookies at any
          time through your browser settings:
        </p>
        <ul>
          <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
          <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
          <li><a href="https://support.apple.com/en-us/HT201265" target="_blank" rel="noopener noreferrer">Safari</a></li>
          <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
        </ul>
        <p>
          To reset your cookie consent preference on this website, clear the <code>cookie-consent</code> entry
          from your browser&apos;s local storage for this domain.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">6. Data Retention</h2>
        <p>
          We do not store personal data on our servers. Analytics and advertising data is retained by
          Google according to their respective data retention policies. Cookie consent preferences are
          stored in your browser&apos;s local storage and persist until you clear them.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">7. Children&apos;s Privacy</h2>
        <p>
          This website is a general-audience sports information site. We do not knowingly collect
          personal information from children under 16. If you believe a child has provided personal
          information through our third-party services, please contact us.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">8. Your Rights (EEA/UK)</h2>
        <p>
          If you are located in the European Economic Area or United Kingdom, you have the right to:
        </p>
        <ul>
          <li>Access the personal data held about you</li>
          <li>Request correction or deletion of your data</li>
          <li>Object to or restrict processing of your data</li>
          <li>Withdraw consent at any time (without affecting the lawfulness of prior processing)</li>
        </ul>
        <p>
          Since we do not collect personal data directly, most of these rights are exercised through
          Google&apos;s tools (see links in Section 4).
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be reflected on this page
          with an updated &ldquo;Last updated&rdquo; date. We encourage you to review this page periodically.
        </p>
      </section>

      <section className="mb-4">
        <h2 className="h5">10. Contact</h2>
        <p>
          If you have any questions about this Privacy Policy, email{' '}
          <a href="mailto:support@knockouts.in">support@knockouts.in</a> or see our{' '}
          <Link href="/contact">Contact</Link> page.
        </p>
      </section>
    </main>
  );
}
