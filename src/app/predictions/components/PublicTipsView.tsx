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

export default function PublicTipsView({ matches, tips }: Props) {
  const allGroups = useMemo(() => {
    const groups = new Set(matches.map((m) => m.groupId));
    return Array.from(groups).sort();
  }, [matches]);

  const [selectedGroup, setSelectedGroup] = useState(allGroups[0] || 'A');

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
            onClick={() => setSelectedGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <h5 className="mb-3">Group {selectedGroup} — Predicted</h5>

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

      {/* Match results */}
      <h6 className="tipovacka-table-label">Predictions</h6>
      {groupMatches.map((m) => {
        const tip = tips[m.id];
        return (
          <div key={m.id} className="tipovacka-compare-match">
            <span className="tipovacka-compare-team">{m.homeTeam.shortName}</span>
            <div className="tipovacka-compare-scores">
              {tip ? (
                <span className={`tipovacka-compare-tip ${tip.points === 4 ? 'exact' : tip.points === 1 ? 'outcome' : tip.points === 0 ? 'wrong' : ''}`}>
                  {tip.homeGoals}:{tip.awayGoals}
                </span>
              ) : (
                <span className="tipovacka-compare-na">-</span>
              )}
              {m.status === 'FINISHED' && m.homeGoals !== null && (
                <>
                  <span className="tipovacka-compare-vs">/</span>
                  <span className="tipovacka-compare-real">{m.homeGoals}:{m.awayGoals}</span>
                </>
              )}
            </div>
            <span className="tipovacka-compare-team text-end">{m.awayTeam.shortName}</span>
          </div>
        );
      })}
    </div>
  );
}
