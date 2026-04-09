import { ImageResponse } from 'next/og';

// Image route for /opengraph-image — used as the default Open Graph + Twitter
// image across the entire site (referenced from app/layout.tsx metadata).
export const runtime = 'nodejs';
export const alt =
  'Knockouts.in — FIFA World Cup 2026 knockout bracket and play-off tracker';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background:
            'linear-gradient(135deg, #0a2540 0%, #0d4f8c 50%, #1976d2 100%)',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 36,
            fontWeight: 700,
            opacity: 0.85,
            marginBottom: 28,
          }}
        >
          <span
            style={{
              display: 'flex',
              width: 18,
              height: 18,
              borderRadius: 999,
              background: '#ffd84d',
              marginRight: 16,
            }}
          />
          KNOCKOUTS.IN
        </div>

        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            maxWidth: '90%',
          }}
        >
          FIFA World Cup 2026
        </div>

        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 16,
            color: '#ffd84d',
          }}
        >
          Knockout Bracket &amp; Play-Off Tracker
        </div>

        <div
          style={{
            fontSize: 30,
            marginTop: 36,
            opacity: 0.9,
            maxWidth: '85%',
          }}
        >
          Live standings · FIFA ranking · Qualification probabilities for all 48 teams
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            display: 'flex',
            alignItems: 'center',
            fontSize: 26,
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          Canada · Mexico · USA
        </div>
      </div>
    ),
    { ...size },
  );
}
