'use client';

import { useEffect, useState } from 'react';

const CONSENT_KEY = 'cookie-consent';

interface AdBannerProps {
  /** AdSense ad slot ID — create one per placement in your AdSense console */
  slot: string;
  /** Ad format: 'auto' (responsive), 'horizontal' (leaderboard), 'rectangle' */
  format?: 'auto' | 'horizontal' | 'rectangle';
  /** Optional extra CSS class */
  className?: string;
}

/**
 * Reusable Google AdSense banner.
 * Only renders when the user has accepted cookies (GDPR-compliant).
 * Falls back to an empty placeholder so layout doesn't shift.
 */
export default function AdBanner({ slot, format = 'auto', className = '' }: AdBannerProps) {
  const [consent, setConsent] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(CONSENT_KEY);
    setConsent(stored === 'granted');

    // Listen for consent changes (e.g. user accepts cookies after page load)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_KEY) {
        setConsent(e.newValue === 'granted');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Push ad after component mounts and consent is given
  useEffect(() => {
    if (consent && mounted) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch {
        // AdSense not loaded yet or ad blocker active
      }
    }
  }, [consent, mounted]);

  if (!mounted || !consent) return null;

  const style: React.CSSProperties =
    format === 'horizontal'
      ? { display: 'block', width: '100%', minHeight: 90 }
      : format === 'rectangle'
        ? { display: 'inline-block', width: 300, height: 250 }
        : { display: 'block' };

  return (
    <div className={`ad-container ${className}`}>
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client="ca-pub-4440685571892428"
        data-ad-slot={slot}
        {...(format === 'auto' ? { 'data-ad-format': 'auto', 'data-full-width-responsive': 'true' } : {})}
      />
    </div>
  );
}
