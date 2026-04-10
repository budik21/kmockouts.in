'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';

const GA_ID = 'G-82JJNM9XMF';
const CONSENT_KEY = 'cookie-consent';

export default function CookieConsent() {
  const [consent, setConsent] = useState<'granted' | 'denied' | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === 'granted' || stored === 'denied') {
      setConsent(stored);
    }
    setLoaded(true);
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'granted');
    setConsent('granted');
  }

  function deny() {
    localStorage.setItem(CONSENT_KEY, 'denied');
    setConsent('denied');
  }

  if (!loaded) return null;

  const showBanner = consent === null;
  const loadGA = consent === 'granted';

  return (
    <>
      {loadGA && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
      )}

      {showBanner && (
        <div className="cookie-banner">
          <div className="container d-flex flex-column flex-sm-row align-items-center justify-content-between gap-3">
            <p className="mb-0" style={{ fontSize: '0.85rem' }}>
              This website uses cookies for traffic analysis (Google Analytics).
            </p>
            <div className="d-flex gap-2 flex-shrink-0">
              <button className="btn btn-sm cookie-btn-accept" onClick={accept}>
                Accept
              </button>
              <button className="btn btn-sm cookie-btn-deny" onClick={deny}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
