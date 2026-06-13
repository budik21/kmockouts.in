'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import TeamFlag from './TeamFlag';
import LocalKickOff from './LocalKickOff';
import { useHasMounted } from '@/lib/use-has-mounted';
import { slugify } from '@/lib/slugify';

interface FixtureTeam {
  name: string;
  shortName: string;
  countryCode: string;
}

export interface FixtureItem {
  id: number;
  groupId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string;
  /** ISO 8601 kickoff (UTC). Grouping by day and the time label are both
   *  derived from this in the visitor's local zone, client-side. */
  kickOff: string;
  status: string;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
}

interface FixtureDay {
  dateKey: string;   // YYYY-MM-DD
  heading: string;   // "Thursday, June 11, 2026"
  pill: string;      // "Jun 11"
  fixtures: FixtureItem[];
}

interface Props {
  fixtures: FixtureItem[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Team page URL, e.g. "/worldcup2026/group-a/team/czech-republic". */
const teamHref = (groupId: string, name: string) =>
  `/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(name)}`;

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

export default function FixturesCalendar({ fixtures }: Props) {
  const mounted = useHasMounted();

  // Group fixtures into day sections. Re-runs once on mount to regroup from UTC
  // (SSR) into the visitor's local zone. Fixtures arrive sorted by kickoff, and
  // absolute time ascending implies local-date ascending, so Map insertion
  // order yields chronological day sections.
  const days = useMemo<FixtureDay[]>(() => {
    const map = new Map<string, FixtureDay>();
    for (const f of fixtures) {
      const dk = dayKey(f.kickOff, mounted);
      if (!map.has(dk)) {
        map.set(dk, { dateKey: dk, heading: formatHeading(dk), pill: formatPill(dk), fixtures: [] });
      }
      map.get(dk)!.fixtures.push(f);
    }
    return Array.from(map.values());
  }, [fixtures, mounted]);

  const [activeDate, setActiveDate] = useState<string>(days[0]?.dateKey ?? '');
  const [todayKey, setTodayKey] = useState<string>('');
  const dateNavRef = useRef<HTMLDivElement>(null);

  const getSection = useCallback((dateStr: string) => {
    return document.getElementById(`fixture-day-${dateStr}`);
  }, []);

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
    const tk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
    const section = getSection(dateStr);
    if (section) {
      const y = section.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }, [scrollPillIntoView, getSection]);

  // Track scroll to update active date
  useEffect(() => {
    const dateKeys = days.map(d => d.dateKey);
    const handleScroll = () => {
      const scrollTop = window.scrollY + 110;
      let current = dateKeys[0] || '';
      for (const dk of dateKeys) {
        const el = document.getElementById(`fixture-day-${dk}`);
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
  }, [days, scrollPillIntoView]);

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
          id={`fixture-day-${day.dateKey}`}
          className="fixtures-day-section"
        >
          <h2 className="fixtures-day-heading">{day.heading}</h2>
          <div className="fixtures-day-grid">
            {day.fixtures.map((f) => (
              <FixtureCard key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FixtureCard({ fixture: f }: { fixture: FixtureItem }) {
  const isFinished = f.status === 'FINISHED';
  const isLive = f.status === 'LIVE';

  return (
    <div className={`fixture-card${isFinished ? ' fixture-finished' : ''}${isLive ? ' fixture-live' : ''}`}>
      <div className="fixture-card-top">
        <Link href={`/worldcup2026/group-${f.groupId.toLowerCase()}`} className="fixture-group-link">Group {f.groupId}</Link>
        <span className="fixture-venue-time">
          <span className="fixture-venue">{f.venue}</span>
          <LocalKickOff
            iso={f.kickOff}
            className="fixture-kickoff"
            timeOptions={{ hour: '2-digit', minute: '2-digit' }}
          />
        </span>
      </div>
      <div className="fixture-card-main">
        <Link href={teamHref(f.groupId, f.homeTeam.name)} className="fixture-team fixture-team-home">
          <span className="fixture-team-name">{f.homeTeam.name}</span>
          <span className="fixture-team-short">{f.homeTeam.shortName}</span>
          <TeamFlag countryCode={f.homeTeam.countryCode} />
        </Link>

        <div className="fixture-score-box">
          {isFinished || isLive ? (
            <span className={`fixture-score${isLive ? ' fixture-score-live' : ''}`}>
              {f.homeGoals} – {f.awayGoals}
            </span>
          ) : (
            <span className="fixture-vs">—</span>
          )}
        </div>

        <Link href={teamHref(f.groupId, f.awayTeam.name)} className="fixture-team fixture-team-away">
          <TeamFlag countryCode={f.awayTeam.countryCode} />
          <span className="fixture-team-name">{f.awayTeam.name}</span>
          <span className="fixture-team-short">{f.awayTeam.shortName}</span>
        </Link>
      </div>
    </div>
  );
}
