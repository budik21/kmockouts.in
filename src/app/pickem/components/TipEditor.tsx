'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { TipMatch } from '../tips/page';
import ArrowStepper from '@/app/components/ArrowStepper';
import { teamLabel } from '@/lib/team-label';
import { slugify } from '@/lib/slugify';

interface TipData {
  homeGoals: number;
  awayGoals: number;
  points: number | null;
}

interface Props {
  matches: TipMatch[];
  tips: Record<number, TipData>;
  onTipUpdate: (matchId: number, homeGoals: number, awayGoals: number) => void;
  allGroups: string[];
  shareToken: string;
  untippedOnly: boolean;
  untippedSnapshot: Set<number> | null;
}

interface StandingRow {
  teamName: string;
  shortName: string;
  countryCode: string;
  fifaRanking: number | null;
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
          fifaRanking: t.fifaRanking,
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

function StandingsTable({ rows, label, groupId }: { rows: StandingRow[]; label: string; groupId: string }) {
  const teamHref = (teamName: string) =>
    `/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(teamName)}`;
  return (
    <div>
      <h6 className="tipovacka-table-label">{label}</h6>
      <div className="table-responsive">
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
            {rows.map((r, i) => (
              <tr key={r.shortName} className={i < 2 ? 'tipovacka-qualified' : ''}>
                <td>{i + 1}</td>
                <td>
                  <Link href={teamHref(r.teamName)} className="tipovacka-team-link">
                    <FlagIcon code={r.countryCode} />{' '}
                    <span className="d-none d-sm-inline">{teamLabel(r.teamName, r.fifaRanking)}</span>
                    <span className="d-inline d-sm-none">{teamLabel(r.shortName, r.fifaRanking)}</span>
                  </Link>
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
    </div>
  );
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

export default function TipEditor({
  matches,
  tips,
  onTipUpdate,
  allGroups,
  shareToken,
  untippedOnly,
  untippedSnapshot,
}: Props) {
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);

  // Read initial group from URL hash, listen for hashchange (back/forward)
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && allGroups.includes(hash)) {
        setGroupFilter(hash);
      } else {
        setGroupFilter('ALL');
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [allGroups]);

  const handleGroupChange = useCallback((group: string) => {
    setGroupFilter(group);
    if (group === 'ALL') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      window.location.hash = group;
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (groupFilter === 'ALL') return;
    const url = `${window.location.origin}/pickem/share/${shareToken}#${groupFilter}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [groupFilter, shareToken]);

  const filteredMatches = useMemo(() => {
    let result = matches;
    if (groupFilter !== 'ALL') {
      result = result.filter((m) => m.groupId === groupFilter);
    }
    if (untippedOnly && untippedSnapshot) {
      result = result.filter((m) => untippedSnapshot.has(m.id));
    }
    return result;
  }, [matches, groupFilter, untippedOnly, untippedSnapshot]);

  // Standings for the selected group (actual results + predictions)
  const groupMatches = useMemo(
    () => (groupFilter === 'ALL' ? [] : matches.filter((m) => m.groupId === groupFilter)),
    [matches, groupFilter],
  );

  const realStandings = useMemo(
    () => buildStandings(groupMatches, (m) => ({
      home: m.status === 'FINISHED' ? m.homeGoals : null,
      away: m.status === 'FINISHED' ? m.awayGoals : null,
    })),
    [groupMatches],
  );

  // Compute inline (no useMemo) so the predicted standings always reflect the
  // latest `tips` state immediately after a tip is entered. With useMemo the
  // table could stay stale until something else re-rendered.
  const tipStandings = buildStandings(groupMatches, (m) => {
    const tip = tips[m.id];
    return tip ? { home: tip.homeGoals, away: tip.awayGoals } : { home: null, away: null };
  });

  // Group by date
  const matchesByDate = useMemo(() => {
    const map = new Map<string, TipMatch[]>();
    for (const m of filteredMatches) {
      const date = formatDate(m.kickOff);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(m);
    }
    return map;
  }, [filteredMatches]);

  const isMatchLocked = (m: TipMatch) => {
    return m.status !== 'SCHEDULED' || new Date(m.kickOff) <= new Date();
  };

  return (
    <div>
      {/* Group filters */}
      <div className="tipovacka-group-filters mb-3">
        <button
          className={`tipovacka-filter-btn ${groupFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => handleGroupChange('ALL')}
        >
          All
        </button>
        {allGroups.map((g) => (
          <button
            key={g}
            className={`tipovacka-filter-btn ${groupFilter === g ? 'active' : ''}`}
            onClick={() => handleGroupChange(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Group header + standings (only when a specific group is selected) */}
      {groupFilter !== 'ALL' && (
        <>
          <div className="tipovacka-group-header mb-3">
            <h5 className="mb-0">Group {groupFilter}</h5>
            <button
              className="tipovacka-share-btn"
              onClick={handleShare}
              title="Copy link to share this group"
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v13" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-md-6">
              <StandingsTable rows={realStandings} label="Actual Standings" groupId={groupFilter} />
            </div>
            <div className="col-md-6">
              <StandingsTable rows={tipStandings} label="Your Predictions" groupId={groupFilter} />
            </div>
          </div>
        </>
      )}

      {/* Matches */}
      {Array.from(matchesByDate.entries()).map(([date, dateMatches]) => (
        <div key={date} className="mb-4">
          <h6 className="tipovacka-date-header">{date}</h6>
          <div className="tipovacka-matches-list">
            {dateMatches.map((match) => {
              const locked = isMatchLocked(match);
              const tip = tips[match.id];
              const homeGoals = tip ? tip.homeGoals : null;
              const awayGoals = tip ? tip.awayGoals : null;
              const hasTip = !!tip;
              const isFinished = match.status === 'FINISHED' && match.homeGoals !== null;
              const hasScore = hasTip && tip.points !== null;

              return (
                <div
                  key={match.id}
                  className={`tipovacka-match-row ${locked ? 'locked' : ''} ${hasTip ? 'has-tip' : 'no-tip'} ${hasScore ? `scored scored-${tip.points}` : ''} ${isFinished && !hasTip ? 'missed' : ''}`}
                >
                  {/* Header: group + teams + time */}
                  <div className="tipovacka-match-header-row">
                    <span className="tipovacka-match-group">{match.groupId}</span>
                    <span className="tipovacka-match-team-labels">
                      <FlagIcon code={match.homeTeam.countryCode} />
                      <span className="tipovacka-team-full">{teamLabel(match.homeTeam.name, match.homeTeam.fifaRanking)}</span>
                      <span className="tipovacka-team-short">{teamLabel(match.homeTeam.shortName, match.homeTeam.fifaRanking)}</span>
                      <span className="tipovacka-match-vs">vs</span>
                      <span className="tipovacka-team-full">{teamLabel(match.awayTeam.name, match.awayTeam.fifaRanking)}</span>
                      <span className="tipovacka-team-short">{teamLabel(match.awayTeam.shortName, match.awayTeam.fifaRanking)}</span>
                      <FlagIcon code={match.awayTeam.countryCode} />
                    </span>
                    <span className="tipovacka-match-time">{formatTime(match.kickOff)}</span>
                  </div>

                  {/* Editable match — not locked yet */}
                  {!locked && (
                    <div className="tipovacka-edit-row">
                      <div className="tipovacka-edit-scores">
                        <ArrowStepper
                          value={homeGoals}
                          onChange={(v) => onTipUpdate(match.id, v ?? 0, awayGoals ?? 0)}
                          min={0}
                          max={15}
                          nullable
                        />
                        <span className="tipovacka-score-separator">:</span>
                        <ArrowStepper
                          value={awayGoals}
                          onChange={(v) => onTipUpdate(match.id, homeGoals ?? 0, v ?? 0)}
                          min={0}
                          max={15}
                          nullable
                        />
                      </div>
                    </div>
                  )}

                  {/* Locked match with evaluation — 3-column strip */}
                  {locked && (isFinished || hasTip) && (
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
                        {isFinished && !hasTip && (
                          <span className="tipovacka-eval-icon tipovacka-eval-icon-missed">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.075 1.362a5 5 0 015.85 0l.018.013c.08.06.17.142.252.232a.75.75 0 01-1.13.99A1.473 1.473 0 009.5 2.5C9.5 1.977 9.053 1.5 8 1.5S6.5 1.977 6.5 2.5c0 .163-.024.288-.065.397l-.018.044c-.052.117-.14.256-.313.442l-.146.153C5.592 3.912 5 4.624 5 6c0 .75.25 1.25.75 1.75S7 8.75 8 8.75a.75.75 0 010 1.5c-1.25 0-2-.5-2.75-1.25S4 7.25 4 6c0-1.875.875-2.875 1.375-3.375l.1-.106c.1-.108.15-.172.178-.236A.608.608 0 005.5 2.5c0-.457.171-.846.557-1.125l.018-.013zM8 13a1 1 0 100-2 1 1 0 000 2z"/></svg>
                          </span>
                        )}
                      </div>

                      {/* Prediction */}
                      <div className="tipovacka-eval-cell">
                        <div className="tipovacka-eval-label">Prediction</div>
                        <div className="tipovacka-eval-value">
                          {hasTip ? `${tip.homeGoals} : ${tip.awayGoals}` : '—'}
                        </div>
                      </div>

                      {/* Actual result */}
                      <div className="tipovacka-eval-cell">
                        <div className="tipovacka-eval-label">Result</div>
                        <div className="tipovacka-eval-value">
                          {isFinished ? `${match.homeGoals} : ${match.awayGoals}` : '—'}
                        </div>
                      </div>

                      {/* Points badge */}
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
                  )}

                  {/* Locked, no tip, not finished — just show dash */}
                  {locked && !isFinished && !hasTip && (
                    <div className="tipovacka-eval-strip">
                      <div className="tipovacka-eval-cell" style={{ flex: 1 }}>
                        <div className="tipovacka-eval-value" style={{ color: 'var(--wc-text-muted)' }}>No prediction</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
