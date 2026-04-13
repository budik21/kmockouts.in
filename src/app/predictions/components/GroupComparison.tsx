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
      {groupMatches.map((m) => {
        const tip = tips[m.id];
        const hasReal = m.homeGoals !== null && m.awayGoals !== null;
        const hasTip = !!tip;
        return (
          <div key={m.id} className="tipovacka-compare-match">
            <span className="tipovacka-compare-team">{m.homeTeam.shortName}</span>
            <div className="tipovacka-compare-scores">
              {hasReal && (
                <span className="tipovacka-compare-real">
                  {m.homeGoals}:{m.awayGoals}
                </span>
              )}
              {!hasReal && <span className="tipovacka-compare-na">-</span>}
              <span className="tipovacka-compare-vs">/</span>
              {hasTip && (
                <span className={`tipovacka-compare-tip ${tip.points === 4 ? 'exact' : tip.points === 1 ? 'outcome' : tip.points === 0 ? 'wrong' : ''}`}>
                  {tip.homeGoals}:{tip.awayGoals}
                </span>
              )}
              {!hasTip && <span className="tipovacka-compare-na">-</span>}
            </div>
            <span className="tipovacka-compare-team text-end">{m.awayTeam.shortName}</span>
          </div>
        );
      })}
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
