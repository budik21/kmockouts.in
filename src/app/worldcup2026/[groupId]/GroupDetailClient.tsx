'use client';

import { useState, useCallback } from 'react';
import GroupStandings, { TeamProbData } from '@/app/components/GroupStandings';
import MatchList from '@/app/components/MatchList';
import ArrowStepper from '@/app/components/ArrowStepper';
import TeamFlag from '@/app/components/TeamFlag';
import { calculateStandings } from '@/engine/standings';
import type { Team, Match, GroupId } from '@/lib/types';

/* ============================================================
   Types
   ============================================================ */

interface MatchForDisplay {
  id: number;
  round: number;
  homeTeam: { id: number; name: string; shortName: string; countryCode: string; fifaRanking?: number };
  awayTeam: { id: number; name: string; shortName: string; countryCode: string; fifaRanking?: number };
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc?: number;
  homeYc2?: number;
  homeRcDirect?: number;
  homeYcRc?: number;
  awayYc?: number;
  awayYc2?: number;
  awayRcDirect?: number;
  awayYcRc?: number;
  venue: string;
  kickOff: string;
  status: string;
}

interface StandingForDisplay {
  position: number;
  team: { id: number; name: string; shortName: string; countryCode: string; isPlaceholder: boolean; fifaRanking?: number };
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface SimScores {
  [matchId: number]: { homeGoals: number; awayGoals: number };
}

export interface GroupDetailClientProps {
  groupId: GroupId;
  standings: StandingForDisplay[];
  matches: MatchForDisplay[];
  probabilities?: Record<number, TeamProbData>;
  /** Full team objects needed for client-side standings recalculation */
  teams: Team[];
  /** Full match objects needed for client-side standings recalculation */
  fullMatches: Match[];
  finishedCount: number;
  totalCount: number;
  /** When true, render the standings in narrow mode (drops MP/GF/GA columns) */
  narrowStandings?: boolean;
}

/* ============================================================
   Session storage helpers
   ============================================================ */

function getSessionKey(groupId: string) {
  return `sim_group_${groupId}`;
}

function loadSimScores(groupId: string): SimScores {
  try {
    const raw = sessionStorage.getItem(getSessionKey(groupId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSimScores(groupId: string, scores: SimScores) {
  sessionStorage.setItem(getSessionKey(groupId), JSON.stringify(scores));
}

function clearSimScores(groupId: string) {
  sessionStorage.removeItem(getSessionKey(groupId));
}

/* ============================================================
   SimulationToggle
   ============================================================ */

function SimulationToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <label className="sim-toggle">
      <span className="sim-toggle-label">Simulate</span>
      <input type="checkbox" checked={active} onChange={onToggle} className="sim-toggle-input" />
      <span className="sim-toggle-track">
        <span className="sim-toggle-thumb" />
      </span>
    </label>
  );
}

/* ============================================================
   SimMatchScore — editable score for a single SCHEDULED match
   ============================================================ */

function SimMatchScore({
  match,
  simScore,
  onScoreChange,
}: {
  match: MatchForDisplay;
  simScore?: { homeGoals: number; awayGoals: number };
  onScoreChange: (matchId: number, homeGoals: number | null, awayGoals: number | null) => void;
}) {
  const homeGoals = simScore?.homeGoals ?? null;
  const awayGoals = simScore?.awayGoals ?? null;

  return (
    <div className="sim-score-edit">
      <ArrowStepper
        value={homeGoals}
        onChange={(v) => {
          const h = v;
          const a = (v !== null && awayGoals === null) ? 0 : awayGoals;
          onScoreChange(match.id, h, a);
        }}
        nullable
        big
      />
      <span className="sim-score-separator">:</span>
      <ArrowStepper
        value={awayGoals}
        onChange={(v) => {
          const a = v;
          const h = (v !== null && homeGoals === null) ? 0 : homeGoals;
          onScoreChange(match.id, h, a);
        }}
        nullable
        big
      />
    </div>
  );
}

/* ============================================================
   SimMatchList — match list with editable scores for SCHEDULED
   ============================================================ */

function SimMatchList({
  matches,
  simScores,
  onScoreChange,
}: {
  matches: MatchForDisplay[];
  simScores: SimScores;
  onScoreChange: (matchId: number, homeGoals: number | null, awayGoals: number | null) => void;
}) {
  const rounds = new Map<number, MatchForDisplay[]>();
  for (const m of matches) {
    const list = rounds.get(m.round) || [];
    list.push(m);
    rounds.set(m.round, list);
  }

  return (
    <div>
      {Array.from(rounds.entries()).map(([round, roundMatches]) => (
        <div key={round}>
          <div className="match-round">Matchday {round}</div>
          {roundMatches.map((m) => {
            const isFinished = m.status === 'FINISHED' || m.status === 'LIVE';
            const isScheduled = m.status === 'SCHEDULED';
            const simScore = simScores[m.id];
            const hasSimScore = isScheduled && simScore != null;

            return (
              <div key={m.id} className={`match-item-wrap ${isScheduled ? 'sim-match-editable' : ''}`}>
                <div className="match-item">
                  <div className="match-team home">
                    <span className="match-name-full">{m.homeTeam.name}</span>
                    <span className="match-name-short">{m.homeTeam.shortName}</span>
                    {m.homeTeam.fifaRanking && (
                      <span className="match-ranking" title={`FIFA Ranking: ${m.homeTeam.fifaRanking}`}>
                        ({m.homeTeam.fifaRanking})
                      </span>
                    )}
                    <TeamFlag countryCode={m.homeTeam.countryCode} className="ms-2" />
                  </div>
                  <div className={`match-score ${isFinished ? '' : 'scheduled'}`}>
                    {isFinished ? (
                      `${m.homeGoals} - ${m.awayGoals}`
                    ) : (
                      <SimMatchScore
                        match={m}
                        simScore={simScore}
                        onScoreChange={onScoreChange}
                      />
                    )}
                  </div>
                  <div className="match-team away">
                    <TeamFlag countryCode={m.awayTeam.countryCode} className="me-2" />
                    <span className="match-name-full">{m.awayTeam.name}</span>
                    <span className="match-name-short">{m.awayTeam.shortName}</span>
                    {m.awayTeam.fifaRanking && (
                      <span className="match-ranking" title={`FIFA Ranking: ${m.awayTeam.fifaRanking}`}>
                        ({m.awayTeam.fifaRanking})
                      </span>
                    )}
                  </div>
                </div>
                {isScheduled && hasSimScore && (
                  <div className="sim-match-reset-row">
                    <button
                      type="button"
                      className="btn btn-link btn-sm sim-reset-btn"
                      onClick={() => onScoreChange(m.id, null, null)}
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Main GroupDetailClient component
   ============================================================ */

export default function GroupDetailClient({
  groupId,
  standings: realStandings,
  matches,
  probabilities: realProbabilities,
  teams,
  fullMatches,
  finishedCount,
  totalCount,
  narrowStandings = false,
}: GroupDetailClientProps) {
  const [simActive, setSimActive] = useState(false);
  const [simScores, setSimScores] = useState<SimScores>({});

  // Toggle simulation on/off
  const handleToggle = useCallback(() => {
    setSimActive((prev) => {
      if (!prev) {
        // Turning ON — load from sessionStorage
        const saved = loadSimScores(groupId);
        setSimScores(saved);
      }
      return !prev;
    });
  }, [groupId]);

  // Handle score change from SimMatchList
  const handleScoreChange = useCallback((matchId: number, homeGoals: number | null, awayGoals: number | null) => {
    setSimScores((prev) => {
      let next: SimScores;
      if (homeGoals === null && awayGoals === null) {
        next = { ...prev };
        delete next[matchId];
      } else {
        next = { ...prev, [matchId]: { homeGoals: homeGoals ?? 0, awayGoals: awayGoals ?? 0 } };
      }
      saveSimScores(groupId, next);
      return next;
    });
  }, [groupId]);

  // Compute simulated standings client-side
  const simulatedStandings = (() => {
    if (!simActive) return null;

    // Merge real matches with simulated scores
    const mergedMatches: Match[] = fullMatches.map((m) => {
      if (m.status === 'FINISHED') return m;
      const sim = simScores[m.id];
      if (sim) {
        return {
          ...m,
          homeGoals: sim.homeGoals,
          awayGoals: sim.awayGoals,
          status: 'FINISHED' as const,
        };
      }
      return m; // Keep as SCHEDULED (won't count in standings)
    });

    const finishedMerged = mergedMatches.filter((m) => m.status === 'FINISHED');
    const standings = calculateStandings({ teams, matches: finishedMerged });

    return standings.map((s) => ({
      ...s,
      team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder, fifaRanking: s.team.fifaRanking },
    }));
  })();

  // Determine which data to display
  const displayStandings = simActive && simulatedStandings ? simulatedStandings : realStandings;
  const displayProbabilities = simActive ? undefined : realProbabilities;

  const simMatchCount = Object.keys(simScores).length;

  return (
    <>
      {/* Standings */}
      <div className={`group-card mb-4 ${simActive ? 'sim-active' : ''}`}>
        <div className="group-card-header">
          <span>
            Standings
            {simActive && <span className="sim-badge">Simulation</span>}
          </span>
          <div className="d-flex align-items-center gap-3">
            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              {finishedCount} of {totalCount} matches played
            </span>
            <SimulationToggle active={simActive} onToggle={handleToggle} />
          </div>
        </div>
        <div className="group-card-body">
          {simActive && (
            <div className="sim-banner">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a1 1 0 110 2 1 1 0 010-2zm1.5 9h-3v-1h1V7.5h-1v-1h2V11h1v1z"/>
              </svg>
              <span>
                You are viewing simulated results.
                {simMatchCount > 0 && ` ${simMatchCount} match${simMatchCount > 1 ? 'es' : ''} simulated.`}
              </span>
            </div>
          )}
          <GroupStandings
            standings={displayStandings}
            groupId={groupId}
            probabilities={displayProbabilities}
            isSimulated={simActive}
            narrow={narrowStandings}
          />
        </div>
      </div>


      {/* Matches */}
      <div className={`group-card ${simActive ? 'sim-active' : ''}`}>
        <div className="group-card-header">
          <span>
            Matches
            {simActive && <span className="sim-badge">Simulation</span>}
          </span>
          {simActive && simMatchCount > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              onClick={() => {
                setSimScores({});
                clearSimScores(groupId);
              }}
            >
              Reset all
            </button>
          )}
        </div>
        <div className="group-card-body">
          {simActive ? (
            <SimMatchList
              matches={matches}
              simScores={simScores}
              onScoreChange={handleScoreChange}
            />
          ) : (
            <MatchList matches={matches} />
          )}
        </div>
      </div>
    </>
  );
}
