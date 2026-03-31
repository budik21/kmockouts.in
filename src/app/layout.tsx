import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";
import Navbar from "./components/Navbar";
import RecalcIndicator from "./components/RecalcIndicator";
import BootstrapClient from "./components/BootstrapClient";
import CookieConsent from "./components/CookieConsent";
import Footer from "./components/Footer";

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
        <RecalcIndicator />
        {children}
        <Footer />
        <CookieConsent />
        <BootstrapClient />
      </body>
    </html>
  );
}
