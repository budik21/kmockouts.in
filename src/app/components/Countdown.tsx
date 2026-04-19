'use client';

import { useState, useEffect, useRef } from 'react';

// Thursday, June 11, 2026, 20:00 UTC — first match kickoff
export const WC_KICKOFF_UTC = new Date('2026-06-11T20:00:00Z').getTime();

interface TimeLeft {
  days: number;
  hours: number;
  mins: number;
  secs: number;
}

function computeTimeLeft(): TimeLeft | null {
  const diff = WC_KICKOFF_UTC - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    mins: Math.floor((diff % 3600000) / 60000),
    secs: Math.floor((diff % 60000) / 1000),
  };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const str = String(value).padStart(2, '0');
  const prevRef = useRef(str);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (prevRef.current !== str) {
      prevRef.current = str;
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 300);
      return () => clearTimeout(t);
    }
  }, [str]);

  return (
    <div className="countdown-group">
      <span className="countdown-value">
        <span
          key={str + (animating ? '-enter' : '')}
          className={animating ? 'countdown-value-inner countdown-value-enter' : 'countdown-value-inner'}
        >
          {str}
        </span>
      </span>
      <span className="countdown-label">{label}</span>
    </div>
  );
}

interface CountdownProps {
  /** Rendered when the tournament has started. If omitted, renders nothing. */
  startedFallback?: React.ReactNode;
}

export default function Countdown({ startedFallback }: CountdownProps = {}) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null | undefined>(undefined);

  useEffect(() => {
    setTimeLeft(computeTimeLeft());
    const id = setInterval(() => setTimeLeft(computeTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  // SSR / first render: show nothing to avoid hydration mismatch
  if (timeLeft === undefined) return null;

  if (timeLeft === null) {
    return <>{startedFallback ?? null}</>;
  }

  return (
    <div className="countdown">
      <div className="countdown-heading">World Cup 2026 starts in</div>
      <div className="countdown-groups">
        <CountdownUnit value={timeLeft.days} label="days" />
        <CountdownUnit value={timeLeft.hours} label="hours" />
        <CountdownUnit value={timeLeft.mins} label="mins" />
        <CountdownUnit value={timeLeft.secs} label="secs" />
      </div>
    </div>
  );
}
