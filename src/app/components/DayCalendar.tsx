'use client';

import { useRef, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useHasMounted } from '@/lib/use-has-mounted';

/** Minimal shape every calendar item must provide. */
export interface DayCalendarItem {
  /** Stable React key, unique across all items. */
  id: number | string;
  /** ISO 8601 kickoff (UTC). Day grouping is derived from this. */
  kickOff: string;
}

interface DayBucket<T> {
  dateKey: string; // YYYY-MM-DD
  heading: string; // "Thursday, June 11, 2026"
  pill: string;    // "Jun 11"
  items: T[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD calendar-day key for an ISO kickoff. Before mount we use the UTC
 *  date (matching the SSR markup); after mount the visitor's local date, so a
 *  late-night match lands on the correct local day. */
function dayKey(iso: string, mounted: boolean): string {
  const d = new Date(iso);
  if (!mounted) return iso.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Thursday, June 11, 2026" from a YYYY-MM-DD key (zone-independent). */
function formatHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Jun 11" from a YYYY-MM-DD key. */
function formatPill(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

interface Props<T extends DayCalendarItem> {
  items: T[];
  /** Renders a single item card. */
  renderItem: (item: T) => ReactNode;
  /** Unique id prefix so multiple calendars on one page don't collide. */
  idPrefix?: string;
}

/**
 * Generic match calendar: groups items into day sections, shows a sticky,
 * horizontally-scrolling date nav, and keeps the active pill in sync with the
 * scroll position. Items must arrive sorted by kickoff (ascending).
 */
export default function DayCalendar<T extends DayCalendarItem>({ items, renderItem, idPrefix = 'cal' }: Props<T>) {
  const mounted = useHasMounted();

  // Group items into day sections. Re-runs once on mount to regroup from UTC
  // (SSR) into the visitor's local zone. Items arrive sorted by kickoff, and
  // absolute time ascending implies local-date ascending, so Map insertion
  // order yields chronological day sections.
  const days = useMemo<DayBucket<T>[]>(() => {
    const map = new Map<string, DayBucket<T>>();
    for (const it of items) {
      const dk = dayKey(it.kickOff, mounted);
      if (!map.has(dk)) {
        map.set(dk, { dateKey: dk, heading: formatHeading(dk), pill: formatPill(dk), items: [] });
      }
      map.get(dk)!.items.push(it);
    }
    return Array.from(map.values());
  }, [items, mounted]);

  const [activeDate, setActiveDate] = useState<string>(days[0]?.dateKey ?? '');
  const [todayKey, setTodayKey] = useState<string>('');
  const dateNavRef = useRef<HTMLDivElement>(null);

  const sectionId = useCallback((dateStr: string) => `${idPrefix}-day-${dateStr}`, [idPrefix]);

  const scrollPillIntoView = useCallback((dateStr: string, instant = false) => {
    const nav = dateNavRef.current;
    if (!nav) return;
    const scroll = nav.querySelector('.fixtures-date-nav-scroll') as HTMLElement;
    const pill = nav.querySelector(`[data-date="${dateStr}"]`) as HTMLElement;
    if (!scroll || !pill) return;
    const target = pill.offsetLeft - scroll.offsetWidth / 2 + pill.offsetWidth / 2;
    scroll.scrollTo({ left: target, behavior: instant ? 'instant' : 'smooth' });
  }, []);

  // Find today or nearest future date on mount
  useEffect(() => {
    const today = new Date();
    const tk = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    setTodayKey(tk);
    let target = days[0]?.dateKey ?? '';
    for (const d of days) {
      if (d.dateKey >= tk) { target = d.dateKey; break; }
      target = d.dateKey;
    }
    setActiveDate(target);
    setTimeout(() => scrollPillIntoView(target), 100);
  }, [days, scrollPillIntoView]);

  const scrollToDate = useCallback((dateStr: string) => {
    setActiveDate(dateStr);
    scrollPillIntoView(dateStr);
    const section = document.getElementById(sectionId(dateStr));
    if (section) {
      const y = section.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }, [scrollPillIntoView, sectionId]);

  // Track scroll to update active date
  useEffect(() => {
    const dateKeys = days.map(d => d.dateKey);
    const handleScroll = () => {
      const scrollTop = window.scrollY + 110;
      let current = dateKeys[0] || '';
      for (const dk of dateKeys) {
        const el = document.getElementById(sectionId(dk));
        if (el) {
          const elTop = el.getBoundingClientRect().top + window.scrollY;
          if (elTop <= scrollTop) current = dk;
        }
      }
      if (current) {
        setActiveDate(prev => {
          if (prev !== current) {
            scrollPillIntoView(current, true);
            return current;
          }
          return prev;
        });
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [days, scrollPillIntoView, sectionId]);

  return (
    <div className="fixtures-calendar">
      {/* Sticky date navigation */}
      <div className="fixtures-date-nav" ref={dateNavRef}>
        <div className="fixtures-date-nav-scroll">
          {days.map((d) => (
            <button
              key={d.dateKey}
              data-date={d.dateKey}
              className={`fixtures-date-pill${d.dateKey === activeDate ? ' active' : ''}${d.dateKey === todayKey ? ' today' : ''}`}
              onClick={() => scrollToDate(d.dateKey)}
            >
              {d.pill}
            </button>
          ))}
        </div>
      </div>

      {/* Match sections by date */}
      {days.map((day) => (
        <div
          key={day.dateKey}
          id={sectionId(day.dateKey)}
          className="fixtures-day-section"
        >
          <h2 className="fixtures-day-heading">{day.heading}</h2>
          <div className="fixtures-day-grid">
            {day.items.map((it) => renderItem(it))}
          </div>
        </div>
      ))}
    </div>
  );
}
