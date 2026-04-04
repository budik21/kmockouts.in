'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TeamFlag from './TeamFlag';

interface TeamEntry {
  name: string;
  shortName: string;
  countryCode: string;
  groupId: string;
}

const TEAMS: TeamEntry[] = [
  { name: 'Mexico', shortName: 'MEX', countryCode: 'MX', groupId: 'A' },
  { name: 'South Africa', shortName: 'RSA', countryCode: 'ZA', groupId: 'A' },
  { name: 'South Korea', shortName: 'KOR', countryCode: 'KR', groupId: 'A' },
  { name: 'Czech Republic', shortName: 'CZE', countryCode: 'CZ', groupId: 'A' },
  { name: 'Canada', shortName: 'CAN', countryCode: 'CA', groupId: 'B' },
  { name: 'Bosnia-Herzegovina', shortName: 'BIH', countryCode: 'BA', groupId: 'B' },
  { name: 'Qatar', shortName: 'QAT', countryCode: 'QA', groupId: 'B' },
  { name: 'Switzerland', shortName: 'SUI', countryCode: 'CH', groupId: 'B' },
  { name: 'Brazil', shortName: 'BRA', countryCode: 'BR', groupId: 'C' },
  { name: 'Morocco', shortName: 'MAR', countryCode: 'MA', groupId: 'C' },
  { name: 'Haiti', shortName: 'HAI', countryCode: 'HT', groupId: 'C' },
  { name: 'Scotland', shortName: 'SCO', countryCode: 'GB-SCT', groupId: 'C' },
  { name: 'United States', shortName: 'USA', countryCode: 'US', groupId: 'D' },
  { name: 'Paraguay', shortName: 'PAR', countryCode: 'PY', groupId: 'D' },
  { name: 'Australia', shortName: 'AUS', countryCode: 'AU', groupId: 'D' },
  { name: 'Türkiye', shortName: 'TUR', countryCode: 'TR', groupId: 'D' },
  { name: 'Germany', shortName: 'GER', countryCode: 'DE', groupId: 'E' },
  { name: 'Curaçao', shortName: 'CUW', countryCode: 'CW', groupId: 'E' },
  { name: 'Ivory Coast', shortName: 'CIV', countryCode: 'CI', groupId: 'E' },
  { name: 'Ecuador', shortName: 'ECU', countryCode: 'EC', groupId: 'E' },
  { name: 'Netherlands', shortName: 'NED', countryCode: 'NL', groupId: 'F' },
  { name: 'Japan', shortName: 'JPN', countryCode: 'JP', groupId: 'F' },
  { name: 'Sweden', shortName: 'SWE', countryCode: 'SE', groupId: 'F' },
  { name: 'Tunisia', shortName: 'TUN', countryCode: 'TN', groupId: 'F' },
  { name: 'Belgium', shortName: 'BEL', countryCode: 'BE', groupId: 'G' },
  { name: 'Egypt', shortName: 'EGY', countryCode: 'EG', groupId: 'G' },
  { name: 'Iran', shortName: 'IRN', countryCode: 'IR', groupId: 'G' },
  { name: 'New Zealand', shortName: 'NZL', countryCode: 'NZ', groupId: 'G' },
  { name: 'Spain', shortName: 'ESP', countryCode: 'ES', groupId: 'H' },
  { name: 'Cape Verde', shortName: 'CPV', countryCode: 'CV', groupId: 'H' },
  { name: 'Saudi Arabia', shortName: 'KSA', countryCode: 'SA', groupId: 'H' },
  { name: 'Uruguay', shortName: 'URU', countryCode: 'UY', groupId: 'H' },
  { name: 'France', shortName: 'FRA', countryCode: 'FR', groupId: 'I' },
  { name: 'Senegal', shortName: 'SEN', countryCode: 'SN', groupId: 'I' },
  { name: 'Iraq', shortName: 'IRQ', countryCode: 'IQ', groupId: 'I' },
  { name: 'Norway', shortName: 'NOR', countryCode: 'NO', groupId: 'I' },
  { name: 'Argentina', shortName: 'ARG', countryCode: 'AR', groupId: 'J' },
  { name: 'Algeria', shortName: 'ALG', countryCode: 'DZ', groupId: 'J' },
  { name: 'Austria', shortName: 'AUT', countryCode: 'AT', groupId: 'J' },
  { name: 'Jordan', shortName: 'JOR', countryCode: 'JO', groupId: 'J' },
  { name: 'Portugal', shortName: 'POR', countryCode: 'PT', groupId: 'K' },
  { name: 'Congo DR', shortName: 'COD', countryCode: 'CD', groupId: 'K' },
  { name: 'Uzbekistan', shortName: 'UZB', countryCode: 'UZ', groupId: 'K' },
  { name: 'Colombia', shortName: 'COL', countryCode: 'CO', groupId: 'K' },
  { name: 'England', shortName: 'ENG', countryCode: 'GB-ENG', groupId: 'L' },
  { name: 'Croatia', shortName: 'CRO', countryCode: 'HR', groupId: 'L' },
  { name: 'Ghana', shortName: 'GHA', countryCode: 'GH', groupId: 'L' },
  { name: 'Panama', shortName: 'PAN', countryCode: 'PA', groupId: 'L' },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function TeamSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = query.length > 0
    ? TEAMS.filter((t) =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.shortName.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const navigate = useCallback((team: TeamEntry) => {
    setOpen(false);
    setQuery('');
    setHighlightIdx(-1);
    router.push(`/worldcup2026/group-${team.groupId.toLowerCase()}/team/${slugify(team.name)}`);
  }, [router]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setHighlightIdx(-1);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        setHighlightIdx(-1);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < filtered.length) {
      e.preventDefault();
      navigate(filtered[highlightIdx]);
    }
  };

  if (!open) {
    return (
      <button
        className="navbar-search-btn"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search teams"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    );
  }

  return (
    <div className="team-search-wrap" ref={wrapRef}>
      <div className="team-search-input-wrap">
        <svg className="team-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          className="team-search-input"
          type="text"
          placeholder="Search team..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>
      {filtered.length > 0 && (
        <ul className="team-search-results">
          {filtered.map((t, i) => (
            <li
              key={t.shortName}
              className={`team-search-item ${i === highlightIdx ? 'team-search-item--active' : ''}`}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); navigate(t); }}
            >
              <TeamFlag countryCode={t.countryCode} />
              <span className="team-search-name-full">{t.name}</span>
              <span className="team-search-name-short">{t.shortName}</span>
              <span className="team-search-group">({t.groupId})</span>
            </li>
          ))}
        </ul>
      )}
      {query.length > 0 && filtered.length === 0 && (
        <div className="team-search-empty">No teams found</div>
      )}
    </div>
  );
}
