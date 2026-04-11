'use client';

import { useState } from 'react';
import TeamFlag from './TeamFlag';

export interface EnrichedMatchResult {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  label: string;
  homeTeamName: string;
  homeTeamShort: string;
  homeCountryCode: string;
  awayTeamName: string;
  awayTeamShort: string;
  awayCountryCode: string;
}

export interface EnrichedCombination {
  shortKey: string;
  matchResults: EnrichedMatchResult[];
}

interface ScenariosAccordionProps {
  edgeScenariosByPosition: { [pos: number]: EnrichedCombination[] };
  probabilities: { [pos: number]: number };
  teamName: string;
  focusTeamId?: number;
  summaries?: { [pos: number]: string };
  /** Called when user clicks a scenario card to apply it */
  onScenarioClick?: (position: number, combo: EnrichedCombination) => void;
  /** Index of the currently applied scenario (position-combo), to highlight it */
  appliedKey?: string | null;
}

const INITIAL_VISIBLE = 4;
const LOAD_MORE_COUNT = 8;

const POSITION_LABELS: { [pos: number]: string } = {
  1: '1st Place',
  2: '2nd Place',
  3: '3rd Place',
  4: '4th Place',
};

function probStyle(prob: number): { background: string; color: string } {
  if (prob <= 0) return { background: '#a31b1b', color: '#ffffff' };
  if (prob >= 80) return { background: '#0a5c2f', color: '#ffffff' };
  if (prob >= 60) return { background: '#1a7a3a', color: '#ffffff' };
  if (prob >= 40) return { background: '#2e9e4e', color: '#ffffff' };
  if (prob >= 20) return { background: '#4db86a', color: '#1a3a1a' };
  return { background: '#7ed69a', color: '#1a3a1a' };
}

export default function ScenariosAccordion({
  edgeScenariosByPosition,
  probabilities,
  teamName,
  focusTeamId,
  summaries,
  onScenarioClick,
  appliedKey,
}: ScenariosAccordionProps) {
  return (
    <div className="group-card mb-4">
      <div className="group-card-header">
        <span>Scenarios — {teamName}</span>
      </div>
      <div className="group-card-body">
        <div className="accordion" id="scenariosAccordion">
          {[1, 2, 3, 4].map((pos) => (
            <PositionSection
              key={pos}
              pos={pos}
              combos={edgeScenariosByPosition[pos] ?? []}
              prob={probabilities[pos] ?? 0}
              summary={summaries?.[pos]}
              focusTeamId={focusTeamId}
              onScenarioClick={onScenarioClick ? (combo) => onScenarioClick(pos, combo) : undefined}
              appliedKey={appliedKey}
            />
          ))}
        </div>
        {onScenarioClick && (
          <p className="text-muted text-center mt-2 mb-0" style={{ fontSize: '0.8rem' }}>
            Click on a scenario to apply it to the standings table above.
          </p>
        )}
      </div>
    </div>
  );
}

function PositionSection({ pos, combos, prob, summary, focusTeamId, onScenarioClick, appliedKey }: { pos: number; combos: EnrichedCombination[]; prob: number; summary?: string; focusTeamId?: number; onScenarioClick?: (combo: EnrichedCombination) => void; appliedKey?: string | null }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const id = `pos-${pos}`;
  const visibleCombos = combos.slice(0, visibleCount);
  const hasMore = combos.length > visibleCount;

  return (
    <div className="accordion-item" style={{ borderLeft: `4px solid ${probStyle(prob).background}` }}>
      <h2 className="accordion-header">
        <button
          className="accordion-button collapsed"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target={`#${id}`}
          aria-expanded="false"
          aria-controls={id}
          style={{ fontSize: '1.125rem' }}
        >
          <span
            className="badge me-2"
            style={{ ...probStyle(prob), minWidth: '75px', fontSize: '1rem', padding: '0.4em 0.6em' }}
          >
            {prob.toFixed(1)}%
          </span>
          {POSITION_LABELS[pos]}
          {combos.length > 0 && (
            <span className="text-muted ms-2" style={{ fontSize: '0.9375rem' }}>
              ({combos.length} scenario{combos.length !== 1 ? 's' : ''})
            </span>
          )}
        </button>
      </h2>
      <div id={id} className="accordion-collapse collapse" data-bs-parent="#scenariosAccordion">
        <div className="accordion-body p-2">
          {summary && (
            <div
              className="scenario-summary-box"
              style={{ borderLeftColor: probStyle(prob).background }}
              dangerouslySetInnerHTML={{ __html: summary }}
            />
          )}
          {combos.length === 0 ? (
            <div className="text-muted text-center py-3" style={{ fontSize: '0.85rem' }}>
              {prob === 0
                ? 'This position is not reachable.'
                : 'No specific scenario examples available.'}
            </div>
          ) : (
            <>
              <div className="scenario-grid">
                {visibleCombos.map((combo, ci) => {
                  const key = `${pos}-${ci}`;
                  return (
                    <CombinationCard
                      key={ci}
                      combo={combo}
                      index={ci + 1}
                      focusTeamId={focusTeamId}
                      onClick={onScenarioClick ? () => onScenarioClick(combo) : undefined}
                      isApplied={appliedKey === key}
                    />
                  );
                })}
              </div>
              {hasMore && (
                <div className="text-center py-2">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setVisibleCount((v) => v + LOAD_MORE_COUNT)}
                  >
                    Load more ({combos.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CombinationCard({ combo, index, focusTeamId, onClick, isApplied }: { combo: EnrichedCombination; index: number; focusTeamId?: number; onClick?: () => void; isApplied?: boolean }) {
  return (
    <div
      className={`scenario-card${onClick ? ' scenario-card-clickable' : ''}${isApplied ? ' scenario-card-applied' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="scenario-card-header">
        Scenario {index}{isApplied && <span className="scenario-applied-badge">Applied</span>}
      </div>
      <div className="scenario-card-body">
        {combo.matchResults.map((mr, i) => (
          <MatchResultRow key={i} mr={mr} focusTeamId={focusTeamId} />
        ))}
      </div>
    </div>
  );
}

function MatchResultRow({ mr, focusTeamId }: { mr: EnrichedMatchResult; focusTeamId?: number }) {
  const gd = mr.homeGoals - mr.awayGoals;
  const isFocusMatch = focusTeamId != null && (mr.homeTeamId === focusTeamId || mr.awayTeamId === focusTeamId);
  const focusIsHome = focusTeamId != null && mr.homeTeamId === focusTeamId;

  // Determine left/right teams: focus team first if it's their match
  const leftShort = (isFocusMatch && !focusIsHome) ? mr.awayTeamShort : mr.homeTeamShort;
  const leftCode = (isFocusMatch && !focusIsHome) ? mr.awayCountryCode : mr.homeCountryCode;
  const rightShort = (isFocusMatch && !focusIsHome) ? mr.homeTeamShort : mr.awayTeamShort;
  const rightCode = (isFocusMatch && !focusIsHome) ? mr.homeCountryCode : mr.awayCountryCode;
  // GD from left team's perspective
  const leftGd = (isFocusMatch && !focusIsHome) ? -gd : gd;

  // Draw
  if (gd === 0) {
    const isDraw00 = mr.homeGoals === 0 && mr.awayGoals === 0;
    const drawLabel = isDraw00 ? '0 : 0' : 'X : X';
    const drawTooltip = isDraw00 ? 'Goalless draw' : 'Scoring draw (1:1 or higher)';
    return (
      <div className="scenario-match">
        <span className="scenario-team home">
          {leftShort}
          <TeamFlag countryCode={leftCode} className="ms-1" />
        </span>
        <span className="scenario-gd scenario-gd-draw" title={drawTooltip} tabIndex={0}>
          {drawLabel}
        </span>
        <span className="scenario-vs">vs.</span>
        <span className="scenario-team away">
          <TeamFlag countryCode={rightCode} className="me-1" />
          {rightShort}
        </span>
      </div>
    );
  }

  // Win/Loss
  const absGd = Math.abs(leftGd);
  const leftWins = leftGd > 0;
  const winnerName = leftWins
    ? ((isFocusMatch && !focusIsHome) ? mr.awayTeamName : mr.homeTeamName)
    : ((isFocusMatch && !focusIsHome) ? mr.homeTeamName : mr.awayTeamName);
  const gdLabel = absGd >= 6 ? (leftWins ? '+6' : '-6') : (leftWins ? `+${absGd}` : `-${absGd}`);
  const tooltip = `${winnerName} wins by ${absGd >= 6 ? '6+' : absGd} goal${absGd === 1 ? '' : 's'} difference`;
  const badgeVariant = leftWins ? 'win' : 'loss';

  return (
    <div className="scenario-match">
      <span className="scenario-team home">
        <span className={`scenario-result-box scenario-result-box--${badgeVariant}`} title={tooltip} tabIndex={0}>
          {leftShort}
          <TeamFlag countryCode={leftCode} className="ms-1" />
          <span className={`scenario-gd-badge scenario-gd-badge--${badgeVariant}`}>{gdLabel}</span>
        </span>
      </span>
      <span className="scenario-vs">vs.</span>
      <span className="scenario-team away">
        <TeamFlag countryCode={rightCode} className="me-1" />
        {rightShort}
      </span>
    </div>
  );
}
