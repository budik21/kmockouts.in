'use client';

import { useHasMounted } from '@/lib/use-has-mounted';

interface LocalKickOffProps {
  /** ISO 8601 kickoff timestamp in UTC, e.g. "2026-06-11T19:00:00Z". */
  iso: string;
  /** Intl options for the date part. Omit to render no date. */
  dateOptions?: Intl.DateTimeFormatOptions;
  /** Intl options for the time part. Omit to render no time. */
  timeOptions?: Intl.DateTimeFormatOptions;
  /** BCP-47 locale(s). Defaults to en-GB so the English UI stays consistent
   *  (24h clock, "11 Jun") regardless of the browser's locale. */
  locale?: string | string[];
  /** Joins the date and time parts. Default ", ". */
  separator?: string;
  /** Part order. Default "date-time". */
  order?: 'date-time' | 'time-date';
  className?: string;
}

function formatParts(
  iso: string,
  { dateOptions, timeOptions, locale = 'en-GB', separator = ', ', order = 'date-time' }: LocalKickOffProps,
  zone: 'utc' | 'local',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tz: Intl.DateTimeFormatOptions = zone === 'utc' ? { timeZone: 'UTC' } : {};
  const parts: string[] = [];
  if (dateOptions) parts.push(d.toLocaleDateString(locale, { ...dateOptions, ...tz }));
  if (timeOptions) parts.push(d.toLocaleTimeString(locale, { ...timeOptions, ...tz }));
  if (order === 'time-date') parts.reverse();
  return parts.join(separator);
}

/**
 * Renders a World Cup kickoff timestamp formatted in the VISITOR'S local
 * timezone. Kickoffs are stored and served as UTC ISO strings; this is the
 * single shared place that converts them for display.
 *
 * Before hydration (SSR + first client render) it formats in UTC so the server
 * and client markup match; a post-mount effect then re-renders in the browser's
 * IANA zone. The rendered <time dateTime> keeps the machine-readable UTC value
 * for SEO and copy-paste.
 */
export default function LocalKickOff(props: LocalKickOffProps) {
  const mounted = useHasMounted();
  const text = formatParts(props.iso, props, mounted ? 'local' : 'utc');
  return (
    <time dateTime={props.iso} className={props.className} suppressHydrationWarning>
      {text}
    </time>
  );
}
