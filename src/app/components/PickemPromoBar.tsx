'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const DISMISS_KEY = 'pickem-promo-dismissed-v1';

export default function PickemPromoBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) !== '1') setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div className="pickem-promo-bar" role="region" aria-label="Pick'em announcement">
      <div className="pickem-promo-inner">
        <Link href="/pickem" className="pickem-promo-link">
          <span className="pickem-promo-icon" aria-hidden="true">🏆</span>
          <span className="pickem-promo-title">Pick&apos;em is live</span>
          <span className="pickem-promo-text">
            — predict all 48 group matches and climb the leaderboard
          </span>
          <span className="pickem-promo-cta">Play now →</span>
        </Link>
        <button
          type="button"
          className="pickem-promo-close"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
