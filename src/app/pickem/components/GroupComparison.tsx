'use client';

import { useState, useMemo } from 'react';
import type { TipMatch } from '../tips/page';

interface TipData {
  homeGoals: number;
  awayGoals: number;
  points: number | null;
}

interface Props {
  matches: TipMatch[];
  tips: Record<number, TipData>;
  allGroups: string[];
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
    if (!teams.has(m.homeTeam.shortName)) {
      teams.set(m.homeTeam.shortName, {
        teamName: m.homeTeam.name,
        shortName: m.homeTeam.shortName,
        countryCode: m.homeTeam.countryCode,
        played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      });
    }
    if (!teams.has(m.awayTeam.shortName)) {
      teams.set(m.awayTeam.shortName, {
        teamName: m.awayTeam.name,
        shortName: m.awayTeam.shortName,
        countryCode: m.awayTeam.countryCode,
        played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      });
    }
  }

  for (const m of groupMatches) {
    const { home: hg, away: ag } = getGoals(m);
    if (hg === null || ag === null) continue;

    const homeTeam = teams.get(m.homeTeam.shortName)!;
    const awayTeam = teams.get(m.awayTeam.shortName)!;

    homeTeam.played++; awayTeam.played++;
    homeTeam.gf += hg; homeTeam.ga += ag;
    awayTeam.gf += ag; awayTeam.ga += hg;

    if (hg > ag) { homeTeam.wins++; homeTeam.pts += 3; awayTeam.losses++; }
    else if (hg < ag) { awayTeam.wins++; awayTeam.pts += 3; homeTeam.losses++; }
    else { homeTeam.draws++; awayTeam.draws++; homeTeam.pts += 1; awayTeam.pts += 1; }
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

function StandingsTable({ rows, label }: { rows: StandingRow[]; label: string }) {
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
                  <FlagIcon code={r.countryCode} />{' '}
                  <span className="d-none d-sm-inline">{r.teamName}</span>
                  <span className="d-inline d-sm-none">{r.shortName}</span>
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

function formatDate(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch { return ''; }
}

function formatTime(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function MatchResults({
  groupMatches,
  tips,
  label,
}: {
  groupMatches: TipMatch[];
  tips: Record<number, TipData>;
  label: string;
}) {
  return (
    <div>
      <h6 className="tipovacka-table-label">{label}</h6>
      <div className="tipovacka-matches-list">
        {groupMatches.map((m) => {
          const tip = tips[m.id];
          const hasTip = !!tip;
          const isFinished = m.status === 'FINISHED' && m.homeGoals !== null;
          const hasScore = hasTip && tip.points !== null;

          return (
            <div
              key={m.id}
              className={`tipovacka-match-row ${hasTip ? 'has-tip' : 'no-tip'} ${hasScore ? `scored scored-${tip.points}` : ''} ${isFinished && !hasTip ? 'missed' : ''}`}
            >
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
              <div className="tipovacka-eval-strip">
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

export default function GroupComparison({ matches, tips, allGroups }: Props) {
  const [selectedGroup, setSelectedGroup] = useState(allGroups[0] || 'A');

  const groupMatches = useMemo(
    () => matches.filter((m) => m.groupId === selectedGroup),
    [matches, selectedGroup],
  );

  const realStandings = useMemo(
    () => buildStandings(groupMatches, (m) => ({
      home: m.status === 'FINISHED' ? m.homeGoals : null,
      away: m.status === 'FINISHED' ? m.awayGoals : null,
    })),
    [groupMatches],
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
            onClick={() => setSelectedGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <h5 className="mb-3">Group {selectedGroup}</h5>

      {/* Side by side standings */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <StandingsTable rows={realStandings} label="Actual Standings" />
        </div>
        <div className="col-md-6">
          <StandingsTable rows={tipStandings} label="Your Predictions" />
        </div>
      </div>

      {/* Match results comparison */}
      <MatchResults
        groupMatches={groupMatches}
        tips={tips}
        label="Results: Actual / Predicted"
      />
    </div>
  );
}
