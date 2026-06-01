'use client';

import { useHasMounted } from '@/lib/use-has-mounted';

interface NextMatchDateProps {
  kickOff: string;
  venue: string;
}

function daysLabel(kickOff: string): string {
  const now = new Date();
  const match = new Date(kickOff);
  // Compare calendar dates in user's local timezone
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchStart = new Date(match.getFullYear(), match.getMonth(), match.getDate());
  const diffDays = Math.round((matchStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1) return `in ${diffDays} days`;
  return '';
}

export default function NextMatchDate({ kickOff, venue }: NextMatchDateProps) {
  // Before mount (SSR + first client render) format in UTC so server/client
  // markup match; after mount switch to the visitor's local timezone. The
  // countdown ("Today"/"Tomorrow") is also relative to local "now", so it's
  // only shown once mounted to avoid a hydration mismatch. See useHasMounted.
  const mounted = useHasMounted();
  const d = new Date(kickOff);
  const tz: Intl.DateTimeFormatOptions = mounted ? {} : { timeZone: 'UTC' };
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...tz });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...tz });
  const countdown = mounted ? daysLabel(kickOff) : '';

  return (
    <span suppressHydrationWarning>
      {date}, {time} · {venue}{countdown && ` (${countdown})`}
    </span>
  );
}
