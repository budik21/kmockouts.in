'use client';

import { useState } from 'react';
import TeamFlag from './TeamFlag';

interface EnrichedMatchResult {
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

interface EnrichedCombination {
  shortKey: string;
  matchResults: EnrichedMatchResult[];
}

interface ScenariosAccordionProps {
  edgeScenariosByPosition: { [pos: number]: EnrichedCombination[] };
  probabilities: { [pos: number]: number };
  teamName: string;
}

const INITIAL_VISIBLE = 4;
const LOAD_MORE_COUNT = 8;

const POSITION_LABELS: { [pos: number]: string } = {
  1: '1st Place',
  2: '2nd Place',
  3: '3rd Place',
  4: '4th Place',
};

const POSITION_COLORS: { [pos: number]: string } = {
  1: 'var(--prob-first)',
  2: 'var(--prob-second)',
  3: 'var(--prob-third)',
  4: 'var(--prob-out)',
};

export default function ScenariosAccordion({
  edgeScenariosByPosition,
  probabilities,
  teamName,
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PositionSection({ pos, combos, prob }: { pos: number; combos: EnrichedCombination[]; prob: number }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const id = `pos-${pos}`;
  const visibleCombos = combos.slice(0, visibleCount);
  const hasMore = combos.length > visibleCount;

  return (
    <div className="accordion-item" style={{ borderLeft: `4px solid ${POSITION_COLORS[pos]}` }}>
      <h2 className="accordion-header">
        <button
          className="accordion-button collapsed"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target={`#${id}`}
          aria-expanded="false"
          aria-controls={id}
          style={{ fontSize: '0.9rem' }}
        >
          <span
            className="badge me-2"
            style={{ background: POSITION_COLORS[pos], minWidth: '60px' }}
          >
            {prob.toFixed(1)}%
          </span>
          {POSITION_LABELS[pos]}
          {combos.length > 0 && (
            <span className="text-muted ms-2" style={{ fontSize: '0.75rem' }}>
              ({combos.length} scenario{combos.length !== 1 ? 's' : ''})
            </span>
          )}
        </button>
      </h2>
      <div id={id} className="accordion-collapse collapse" data-bs-parent="#scenariosAccordion">
        <div className="accordion-body p-2">
          {combos.length === 0 ? (
            <div className="text-muted text-center py-3" style={{ fontSize: '0.85rem' }}>
              {prob === 0
                ? 'This position is not reachable.'
                : 'No specific scenario examples available.'}
            </div>
          ) : (
            <>
              <div className="scenario-grid">
                {visibleCombos.map((combo, ci) => (
                  <CombinationCard key={ci} combo={combo} index={ci + 1} />
                ))}
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

function CombinationCard({ combo, index }: { combo: EnrichedCombination; index: number }) {
  return (
    <div className="scenario-card">
      <div className="scenario-card-header">
        Scenario {index}
      </div>
      <div className="scenario-card-body">
        {combo.matchResults.map((mr, i) => {
          const isHomeWin = mr.homeGoals > mr.awayGoals;
          const isAwayWin = mr.awayGoals > mr.homeGoals;
          return (
            <div className="scenario-match" key={i}>
              <span
                className="scenario-team home"
                style={{ fontWeight: isHomeWin ? 700 : 400 }}
              >
                {mr.homeTeamShort}
                <TeamFlag countryCode={mr.homeCountryCode} className="ms-1" />
              </span>
              <span className="scenario-score">
                {mr.homeGoals} : {mr.awayGoals}
              </span>
              <span
                className="scenario-team away"
                style={{ fontWeight: isAwayWin ? 700 : 400 }}
              >
                <TeamFlag countryCode={mr.awayCountryCode} className="me-1" />
                {mr.awayTeamShort}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
