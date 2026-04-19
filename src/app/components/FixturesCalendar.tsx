'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import TeamFlag from './TeamFlag';

interface FixtureTeam {
  name: string;
  shortName: string;
  countryCode: string;
}

interface FixtureItem {
  id: number;
  groupId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string;
  time: string;
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
  days: FixtureDay[];
}

export default function FixturesCalendar({ days }: Props) {
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
          <span className="fixture-kickoff">{f.time}</span>
        </span>
      </div>
      <div className="fixture-card-main">
        <div className="fixture-team fixture-team-home">
          <span className="fixture-team-name">{f.homeTeam.name}</span>
          <span className="fixture-team-short">{f.homeTeam.shortName}</span>
          <TeamFlag countryCode={f.homeTeam.countryCode} />
        </div>

        <div className="fixture-score-box">
          {isFinished || isLive ? (
            <span className={`fixture-score${isLive ? ' fixture-score-live' : ''}`}>
              {f.homeGoals} – {f.awayGoals}
            </span>
          ) : (
            <span className="fixture-vs">—</span>
          )}
        </div>

        <div className="fixture-team fixture-team-away">
          <TeamFlag countryCode={f.awayTeam.countryCode} />
          <span className="fixture-team-name">{f.awayTeam.name}</span>
          <span className="fixture-team-short">{f.awayTeam.shortName}</span>
        </div>
      </div>
    </div>
  );
}
