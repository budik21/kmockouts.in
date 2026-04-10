import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "bootstrap/dist/css/bootstrap.min.css";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";
import Navbar from "./components/Navbar";
import RecalcIndicator from "./components/RecalcIndicator";
import BootstrapClient from "./components/BootstrapClient";
import CookieConsent from "./components/CookieConsent";
import Footer from "./components/Footer";
import JsonLd from "./components/JsonLd";

const ADSENSE_ID = "ca-pub-4440685571892428";
import {
  SITE_URL,
  SITE_NAME,
  SITE_LOCALE,
  TWITTER_HANDLE,
  DEFAULT_KEYWORDS,
  DEFAULT_DESCRIPTION,
  TOURNAMENT,
} from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "FIFA World Cup 2026 — Knockout Bracket, Standings & Play-Off Tracker | Knockouts.in",
    template: "%s | Knockouts.in",
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "sports",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    title:
      "FIFA World Cup 2026 — Knockout Bracket & Play-Off Tracker",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Knockouts.in — FIFA World Cup 2026 knockout bracket and play-off tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    title: "FIFA World Cup 2026 — Knockout Bracket & Play-Off Tracker",
    description:
      "Live World Cup 2026 bracket, standings, FIFA ranking and qualification probabilities.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0d6efd",
  width: "device-width",
  initialScale: 1,
};

/**
 * Global JSON-LD: WebSite + SportsEvent describing the tournament itself.
 * Group/team-level structured data is added on the corresponding pages.
 */
const globalJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: TOURNAMENT.name,
    description:
      "The 23rd edition of the FIFA World Cup, jointly hosted by Canada, Mexico and the United States. 48 national soccer teams compete in 12 groups, with knockout rounds from the Round of 32 to the Final.",
    sport: "Soccer",
    startDate: TOURNAMENT.startDate,
    endDate: TOURNAMENT.endDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: `${SITE_URL}/worldcup2026`,
    location: TOURNAMENT.hostCountries.map((country) => ({
      "@type": "Country",
      name: country,
    })),
    organizer: {
      "@type": "SportsOrganization",
      name: TOURNAMENT.organizer.name,
      url: TOURNAMENT.organizer.url,
    },
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-bs-theme="light">
      <body>
        <Script
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        <Navbar />
        <RecalcIndicator />
        {children}
        <Footer />
        <CookieConsent />
        <BootstrapClient />
        <JsonLd data={globalJsonLd} />
      </body>
    </html>
  );
}
