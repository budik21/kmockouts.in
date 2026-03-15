import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";
import Navbar from "./components/Navbar";
import BootstrapClient from "./components/BootstrapClient";
import CookieConsent from "./components/CookieConsent";

export const metadata: Metadata = {
  title: "Knockouts.in | FIFA World Cup 2026",
  description: "Track group standings, match results, and qualification probabilities for the FIFA World Cup 2026 in Canada, Mexico & USA.",
  keywords: ["FIFA", "World Cup", "2026", "qualification", "standings", "probability"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-bs-theme="light">
      <body>
        <Navbar />
        {children}
        <footer className="text-center py-4 mt-4" style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
          <div className="container">
            <p className="mb-1">Knockouts.in &mdash; FIFA World Cup 2026 Tracker</p>
            <p className="mb-0">Canada, Mexico &amp; USA &bull; June 11 &ndash; July 19, 2026</p>
          </div>
        </footer>
        <CookieConsent />
        <BootstrapClient />
      </body>
    </html>
  );
}
