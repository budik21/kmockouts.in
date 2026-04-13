'use client';

import { signIn } from 'next-auth/react';

export default function LandingPage() {
  return (
    <div className="tipovacka-landing">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-7 text-center">
            <div className="tipovacka-hero-icon">&#9917;</div>
            <h1 className="tipovacka-title">World Cup 2026 Predictions</h1>
            <p className="tipovacka-subtitle">
              Predict the exact scores of all 48 group-stage matches.
              Earn <strong>4 points</strong> for an exact score and <strong>1 point</strong> for
              guessing the correct outcome (win, draw, or loss).
            </p>

            <div className="tipovacka-steps">
              <div className="tipovacka-step">
                <div className="tipovacka-step-num">1</div>
                <div>
                  <strong>Sign in</strong>
                  <p>Use your Google account</p>
                </div>
              </div>
              <div className="tipovacka-step">
                <div className="tipovacka-step-num">2</div>
                <div>
                  <strong>Enter predictions</strong>
                  <p>Predict exact scores for every group-stage match</p>
                </div>
              </div>
              <div className="tipovacka-step">
                <div className="tipovacka-step-num">3</div>
                <div>
                  <strong>Track your score</strong>
                  <p>Compare your predictions with reality and share with friends</p>
                </div>
              </div>
            </div>

            <div className="tipovacka-auth-buttons">
              <button
                className="tipovacka-btn tipovacka-btn-google"
                onClick={() => signIn('google', { callbackUrl: '/predictions/tips' })}
              >
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
