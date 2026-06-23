'use client';

import { signIn } from 'next-auth/react';

type Gtag = (command: 'event', name: string, params?: Record<string, unknown>) => void;

export default function PlayoffLanding() {
  // Mirror the group-stage landing: fire the Google Ads conversion (if gtag is
  // available after cookie consent), then start the OAuth flow.
  function handleSignIn() {
    const startSignIn = () => signIn('google', { callbackUrl: '/pickem/playoff' });
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;

    if (typeof gtag !== 'function') {
      startSignIn();
      return;
    }
    let navigated = false;
    const proceed = () => {
      if (navigated) return;
      navigated = true;
      startSignIn();
    };
    gtag('event', 'conversion_event_subscribe_paid', { event_callback: proceed, event_timeout: 2000 });
    setTimeout(proceed, 2000);
  }

  return (
    <div className="tipovacka-landing">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-8 text-center">
            <div className="tipovacka-hero-icon">&#127942;</div>
            <h1 className="tipovacka-title">World Cup 2026 Play-off Predictions</h1>
            <p className="tipovacka-subtitle">
              The group stage is done — now predict the knockout rounds.
              Call the medalists and pick your way through the bracket.
            </p>

            {/* ── Rules ── */}
            <div className="playoff-rules">
              <div className="playoff-rules-card">
                <h2 className="playoff-rules-title">🏅 Your top 4</h2>
                <ul className="playoff-rules-list">
                  <li><span className="playoff-pts">25</span> Champion (winner of the final)</li>
                  <li><span className="playoff-pts">20</span> Runner-up (loser of the final)</li>
                  <li><span className="playoff-pts">10</span> Each of the two losing semifinalists</li>
                </ul>
                <p className="playoff-rules-note">
                  Four different teams, only from the 32 in the bracket. Locked
                  <strong> 1 hour before</strong> the first knockout kick-off.
                </p>
              </div>

              <div className="playoff-rules-card">
                <h2 className="playoff-rules-title">⚔️ Every knockout match</h2>
                <ul className="playoff-rules-list">
                  <li><span className="playoff-pts">8</span> Exact score after 90 minutes</li>
                  <li><span className="playoff-pts">5</span> Correctly picking who advances</li>
                </ul>
                <p className="playoff-rules-note">
                  You can tip a match once both teams are known, up until
                  <strong> 5 minutes before</strong> kick-off — just like the group stage.
                </p>
              </div>
            </div>

            <div className="tipovacka-auth-buttons">
              <button className="tipovacka-btn tipovacka-btn-google" onClick={handleSignIn}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
