'use client';

import { useState, useMemo, useCallback, ReactNode } from 'react';
import GroupStandings, { TeamProbData } from './GroupStandings';
import ScenariosAccordion, { EnrichedCombination } from './ScenariosAccordion';
import { calculateStandings } from '@/engine/standings';
import { explainTiebreakers } from '@/engine/tiebreaker-explain';
import type { Team, Match, GroupId } from '@/lib/types';

/* ============================================================
   Types
   ============================================================ */

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

interface AppliedScenario {
  position: number;
  comboIndex: number;
  combo: EnrichedCombination;
  label: string;
}

/* ============================================================
   Helpers
   ============================================================ */

const POSITION_LABELS: Record<number, string> = {
  1: '1st place',
  2: '2nd place',
  3: '3rd place',
  4: '4th place',
};

/** Build a human-readable label for the applied scenario */
function buildScenarioLabel(position: number, combo: EnrichedCombination, focusTeamName: string): string {
  const parts = combo.matchResults.map((mr) => {
    const gd = mr.homeGoals - mr.awayGoals;
    if (gd === 0) {
      const isDraw00 = mr.homeGoals === 0 && mr.awayGoals === 0;
      return `${mr.homeTeamShort} ${isDraw00 ? '0:0' : 'X:X'} ${mr.awayTeamShort}`;
    }
    const winnerShort = gd > 0 ? mr.homeTeamShort : mr.awayTeamShort;
    const loserShort = gd > 0 ? mr.awayTeamShort : mr.homeTeamShort;
    const absGd = Math.abs(gd);
    return `${winnerShort} +${absGd} vs. ${loserShort}`;
  });
  return `${focusTeamName}, ${POSITION_LABELS[position]}: ${parts.join(', ')}`;
}

/** Convert scenario match results into synthetic Match objects for standings calc */
function scenarioToMatches(combo: EnrichedCombination, groupId: GroupId): Match[] {
  return combo.matchResults.map((mr) => ({
    id: mr.matchId,
    groupId,
    round: 0,
    homeTeamId: mr.homeTeamId,
    awayTeamId: mr.awayTeamId,
    homeGoals: mr.homeGoals,
    awayGoals: mr.awayGoals,
    homeYc: 0,
    homeYc2: 0,
    homeRcDirect: 0,
    homeYcRc: 0,
    awayYc: 0,
    awayYc2: 0,
    awayRcDirect: 0,
    awayYcRc: 0,
    venue: '',
    kickOff: '',
    status: 'FINISHED' as const,
  }));
}

/* ============================================================
   Component
   ============================================================ */

export interface TeamScenarioViewProps {
  groupId: GroupId;
  standings: StandingForDisplay[];
  probabilities?: Record<number, TeamProbData>;
  edgeScenariosByPosition: { [pos: number]: EnrichedCombination[] };
  scenarioProbabilities: { [pos: number]: number };
  teamName: string;
  focusTeamId: number;
  summaries?: { [pos: number]: string };
  /** Full team objects for client-side standings recalculation */
  teams: Team[];
  /** Finished matches (base data) for recalculation */
  playedMatches: Match[];
  /** When provided, the standings card is placed on the right of a two-column
   *  layout with this article slot on the left (desktop). On mobile/tablet the
   *  layout collapses so the article appears first, then the table. */
  articleSlot?: ReactNode;
}

export default function TeamScenarioView({
  groupId,
  standings: baseStandings,
  probabilities,
  edgeScenariosByPosition,
  scenarioProbabilities,
  teamName,
  focusTeamId,
  summaries,
  teams,
  playedMatches,
  articleSlot,
}: TeamScenarioViewProps) {
  const [applied, setApplied] = useState<AppliedScenario | null>(null);
  const hasScenarios = Object.values(edgeScenariosByPosition).some((combos) => combos.length > 0);

  const handleScenarioClick = useCallback((position: number, combo: EnrichedCombination) => {
    // Find the combo index within its position group
    const combos = edgeScenariosByPosition[position] ?? [];
    const idx = combos.indexOf(combo);
    const key = `${position}-${idx}`;

    // Toggle off if already applied
    if (applied && applied.position === position && applied.comboIndex === idx) {
      setApplied(null);
      return;
    }

    setApplied({
      position,
      comboIndex: idx,
      combo,
      label: buildScenarioLabel(position, combo, teamName),
    });
  }, [applied, edgeScenariosByPosition, teamName]);

  // Recalculate standings when a scenario is applied
  const { displayStandings, tiebreakerNotes } = useMemo(() => {
    if (!applied) return { displayStandings: baseStandings, tiebreakerNotes: [] as string[] };

    const syntheticMatches = scenarioToMatches(applied.combo, groupId);
    // Merge played + synthetic (replace any match with same ID)
    const playedIds = new Set(syntheticMatches.map((m) => m.id));
    const mergedMatches = [
      ...playedMatches.filter((m) => !playedIds.has(m.id)),
      ...syntheticMatches,
    ];

    const newStandings = calculateStandings({ teams, matches: mergedMatches });
    const notes = explainTiebreakers(newStandings, mergedMatches);
    const mapped = newStandings.map((s) => ({
      ...s,
      team: {
        id: s.team.id,
        name: s.team.name,
        shortName: s.team.shortName,
        countryCode: s.team.countryCode,
        isPlaceholder: s.team.isPlaceholder,
        fifaRanking: s.team.fifaRanking,
      },
    }));
    return { displayStandings: mapped, tiebreakerNotes: notes };
  }, [applied, baseStandings, playedMatches, teams, groupId]);

  const appliedKey = applied ? `${applied.position}-${applied.comboIndex}` : null;

  const standingsCard = (
    <div className={`group-card mb-4${applied ? ' sim-active' : ''}`}>
      <div className="group-card-header">
        <span>
          {applied ? 'Scenario Standings' : 'Current Standings'} — Group {groupId}
          {applied && <span className="sim-badge">Scenario</span>}
        </span>
      </div>
      {applied && (
        <div className="sim-banner scenario-banner">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
            <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.399l-.451.05.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
          </svg>
          <div className="scenario-banner-content">
            <span className="scenario-banner-label">{applied.label}</span>
            {tiebreakerNotes.length > 0 && (
              <span className="scenario-tiebreaker-note">
                Tiebreaker: {tiebreakerNotes.join(' | ')}
              </span>
            )}
          </div>
          <button
            className="btn btn-sm btn-outline-warning ms-auto scenario-reset-btn"
            onClick={() => setApplied(null)}
          >
            Reset
          </button>
        </div>
      )}
      <div className="group-card-body">
        <GroupStandings
          standings={displayStandings}
          groupId={groupId}
          probabilities={applied ? undefined : probabilities}
          isSimulated={!!applied}
          focusTeamId={focusTeamId}
          narrow={!!articleSlot}
        />
      </div>
    </div>
  );

  return (
    <>
      {articleSlot ? (
        <div className="group-detail-layout">
          <div>{articleSlot}</div>
          <div>{standingsCard}</div>
        </div>
      ) : (
        standingsCard
      )}

      {/* Scenarios accordion — only when there are scenarios. Always rendered
          full-width below the article+table layout. */}
      {hasScenarios && (
        <ScenariosAccordion
          edgeScenariosByPosition={edgeScenariosByPosition}
          probabilities={scenarioProbabilities}
          teamName={teamName}
          focusTeamId={focusTeamId}
          summaries={summaries}
          onScenarioClick={handleScenarioClick}
          appliedKey={appliedKey}
        />
      )}
    </>
  );
}
