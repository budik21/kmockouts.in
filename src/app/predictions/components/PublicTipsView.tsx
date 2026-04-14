'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { TipMatch } from '../tips/page';

interface TipData {
  homeGoals: number;
  awayGoals: number;
  points: number | null;
}

interface Props {
  matches: TipMatch[];
  tips: Record<number, TipData>;
  userName: string;
  shareToken: string;
}

interface StandingRow {
  teamName: string;
  shortName: string;
  countryCode: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

function buildStandings(
  groupMatches: TipMatch[],
  getGoals: (m: TipMatch) => { home: number | null; away: number | null },
): StandingRow[] {
  const teams = new Map<string, StandingRow>();
  for (const m of groupMatches) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (!teams.has(t.shortName)) {
        teams.set(t.shortName, {
          teamName: t.name, shortName: t.shortName, countryCode: t.countryCode,
          played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0,
        });
      }
    }
  }
  for (const m of groupMatches) {
    const { home: hg, away: ag } = getGoals(m);
    if (hg === null || ag === null) continue;
    const h = teams.get(m.homeTeam.shortName)!;
    const a = teams.get(m.awayTeam.shortName)!;
    h.played++; a.played++;
    h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.wins++; h.pts += 3; a.losses++; }
    else if (hg < ag) { a.wins++; a.pts += 3; h.losses++; }
    else { h.draws++; a.draws++; h.pts++; a.pts++; }
  }
  const rows = Array.from(teams.values());
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return rows;
}

function FlagIcon({ code }: { code: string }) {
  if (!code) return <span>?</span>;
  const cls = code.length > 2
    ? `fi fi-${code.slice(0, 2).toLowerCase()} fis fi-${code.toLowerCase()}`
    : `fi fi-${code.toLowerCase()}`;
  return <span className={`${cls} flag-sm`} />;
}

function formatDate(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch { return ''; }
}

function formatTime(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return ''; }
}

export default function PublicTipsView({ matches, tips, userName, shareToken }: Props) {
  const allGroups = useMemo(() => {
    const groups = new Set(matches.map((m) => m.groupId));
    return Array.from(groups).sort();
  }, [matches]);

  // Read initial group from URL hash
  const getGroupFromHash = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.replace('#', '');
    if (hash && allGroups.includes(hash)) return hash;
    return null;
  }, [allGroups]);

  const [selectedGroup, setSelectedGroup] = useState(allGroups[0] || 'A');
  const [copied, setCopied] = useState(false);

  // Set group from hash on mount
  useEffect(() => {
    const fromHash = getGroupFromHash();
    if (fromHash) setSelectedGroup(fromHash);
  }, [getGroupFromHash]);

  // Update hash when group changes
  const handleGroupChange = useCallback((group: string) => {
    setSelectedGroup(group);
    window.location.hash = group;
  }, []);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const fromHash = getGroupFromHash();
      if (fromHash) setSelectedGroup(fromHash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [getGroupFromHash]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/predictions/share/${shareToken}#${selectedGroup}`;
  }, [shareToken, selectedGroup]);

  const handleShare = useCallback(async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const groupMatches = useMemo(
    () => matches.filter((m) => m.groupId === selectedGroup),
    [matches, selectedGroup],
  );

  const tipStandings = useMemo(
    () => buildStandings(groupMatches, (m) => {
      const tip = tips[m.id];
      return tip ? { home: tip.homeGoals, away: tip.awayGoals } : { home: null, away: null };
    }),
    [groupMatches, tips],
  );

  return (
    <div>
      {/* Group selector */}
      <div className="tipovacka-group-filters mb-3">
        {allGroups.map((g) => (
          <button
            key={g}
            className={`tipovacka-filter-btn ${selectedGroup === g ? 'active' : ''}`}
            onClick={() => handleGroupChange(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="tipovacka-group-header">
        <h5 className="mb-0">{userName}&apos;s prediction of Group {selectedGroup}</h5>
        <button className="tipovacka-share-btn" onClick={handleShare} title="Copy link to this group">
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h2.5a.75.75 0 000-1.5h-2.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h5.5a.25.25 0 01.25.25v1a.75.75 0 001.5 0v-1A1.75 1.75 0 009.25 2h-5.5z"/><path d="M6.75 6A1.75 1.75 0 005 7.75v5.5c0 .966.784 1.75 1.75 1.75h5.5A1.75 1.75 0 0014 13.25v-5.5A1.75 1.75 0 0012.25 6h-5.5zM6.5 7.75a.25.25 0 01.25-.25h5.5a.25.25 0 01.25.25v5.5a.25.25 0 01-.25.25h-5.5a.25.25 0 01-.25-.25v-5.5z"/></svg>
              Share
            </>
          )}
        </button>
      </div>

      {/* Standings table */}
      <div className="table-responsive mb-4">
        <table className="table table-sm tipovacka-standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th className="text-center">MP</th>
              <th className="text-center">W</th>
              <th className="text-center">D</th>
              <th className="text-center">L</th>
              <th className="text-center">G</th>
              <th className="text-center">Pts</th>
            </tr>
          </thead>
          <tbody>
            {tipStandings.map((r, i) => (
              <tr key={r.shortName} className={i < 2 ? 'tipovacka-qualified' : ''}>
                <td>{i + 1}</td>
                <td>
                  <FlagIcon code={r.countryCode} />{' '}
                  {r.teamName}
                </td>
                <td className="text-center">{r.played}</td>
                <td className="text-center">{r.wins}</td>
                <td className="text-center">{r.draws}</td>
                <td className="text-center">{r.losses}</td>
                <td className="text-center">{r.gf}:{r.ga}</td>
                <td className="text-center fw-bold">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Match results — card + eval strip layout */}
      <h6 className="tipovacka-table-label">Predictions</h6>
      <div className="tipovacka-matches-list">
        {groupMatches.map((m) => {
          const tip = tips[m.id];
          const hasTip = !!tip;
          const isFinished = m.status === 'FINISHED' && m.homeGoals !== null;
          const hasScore = hasTip && tip.points !== null;

          return (
            <div
              key={m.id}
              className={`tipovacka-match-row ${hasTip ? 'has-tip' : 'no-tip'} ${hasScore ? `scored scored-${tip.points}` : ''}`}
            >
              {/* Header: teams + venue/time */}
              <div className="tipovacka-match-header-row">
                <span className="tipovacka-match-team-labels">
                  <FlagIcon code={m.homeTeam.countryCode} />
                  <span className="tipovacka-team-full">{m.homeTeam.name}</span>
                  <span className="tipovacka-team-short">{m.homeTeam.shortName}</span>
                  <span className="tipovacka-match-vs">vs</span>
                  <span className="tipovacka-team-full">{m.awayTeam.name}</span>
                  <span className="tipovacka-team-short">{m.awayTeam.shortName}</span>
                  <FlagIcon code={m.awayTeam.countryCode} />
                </span>
              </div>
              <div className="tipovacka-match-meta">
                {m.venue && <span>{m.venue}</span>}
                <span>{formatDate(m.kickOff)}, {formatTime(m.kickOff)}</span>
              </div>

              {/* Eval strip with leading icon */}
              <div className="tipovacka-eval-strip">
                {/* Score icon */}
                <div className="tipovacka-eval-icon-cell">
                  {hasScore && (
                    <span className={`tipovacka-eval-icon tipovacka-eval-icon-${tip.points}`}>
                      {(tip.points === 4 || tip.points === 1) && (
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
                      )}
                      {tip.points === 0 && (
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
                      )}
                    </span>
                  )}
                </div>

                <div className="tipovacka-eval-cell">
                  <div className="tipovacka-eval-label">Prediction</div>
                  <div className="tipovacka-eval-value">
                    {hasTip ? `${tip.homeGoals} : ${tip.awayGoals}` : '—'}
                  </div>
                </div>
                <div className="tipovacka-eval-cell">
                  <div className="tipovacka-eval-label">Result</div>
                  <div className="tipovacka-eval-value">
                    {isFinished ? `${m.homeGoals} : ${m.awayGoals}` : '—'}
                  </div>
                </div>
                <div className="tipovacka-eval-cell tipovacka-eval-score-cell">
                  {hasScore ? (
                    <>
                      <div className="tipovacka-eval-label">Points</div>
                      <span className={`tipovacka-eval-badge tipovacka-eval-badge-${tip.points}`}>
                        {tip.points === 4 && '+4'}
                        {tip.points === 1 && '+1'}
                        {tip.points === 0 && '0'}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="tipovacka-eval-label">Points</div>
                      <div className="tipovacka-eval-value tipovacka-eval-pending">
                        {hasTip ? 'Pending' : '—'}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
