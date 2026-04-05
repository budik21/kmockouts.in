'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScenarioMeta } from '@/app/worldcup2026/scenarios/page';

interface Props {
  scenarios: ScenarioMeta[];
  active: number | null;
}

const SCENARIO_ICONS = ['🏟️', '⚽', '🏆', '🎯'];

export default function ScenarioPicker({ scenarios, active }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null); // null = idle, else scenarioId being applied
  const [error, setError] = useState<string | null>(null);

  const isAnyLoading = loading !== null;

  async function apply(scenarioId: number) {
    setLoading(scenarioId);
    setError(null);
    try {
      const res = await fetch('/api/scenarios/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        setError(data.error ?? 'Failed to apply scenario');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(null);
    }
  }

  function cardClasses(isActive: boolean, isFeatured = false) {
    return [
      'scenario-card',
      isActive ? 'scenario-card-active' : '',
      isFeatured ? 'scenario-card-featured' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  function btnClasses(isActive: boolean) {
    return ['scenario-apply-btn', isActive ? 'scenario-apply-btn-selected' : '']
      .filter(Boolean)
      .join(' ');
  }

  function renderBtn(scenarioId: number, isActive: boolean) {
    const isThisLoading = loading === scenarioId;
    return (
      <button
        className={btnClasses(isActive)}
        disabled={isActive || isAnyLoading}
        onClick={() => apply(scenarioId)}
      >
        {isThisLoading ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Applying…
          </>
        ) : isActive ? (
          '✓ Currently Active'
        ) : (
          'Apply'
        )}
      </button>
    );
  }

  return (
    <div>
      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="scenario-cards">
        {/* ── Reset card ── */}
        <div className={cardClasses(active === null)}>
          {isAnyLoading && loading === 0 && <div className="scenario-card-overlay"><span className="spinner-border" /></div>}
          <div className="scenario-card-eyebrow">Starting state</div>
          <div className="scenario-card-icon">🔄</div>
          <h3 className="scenario-card-title">Reset</h3>
          <p className="scenario-card-tagline">No Results</p>
          <p className="scenario-card-desc">
            Clear all match results. The tournament is in its pre-played state —
            every fixture is scheduled, no results recorded yet.
          </p>
          <ul className="scenario-feature-list">
            <li><span className="scenario-check">✓</span> 0 matches played</li>
            <li><span className="scenario-check">✓</span> All fixtures scheduled</li>
            <li><span className="scenario-check">✓</span> Pre-tournament view</li>
            <li><span className="scenario-check">✓</span> Probabilities reset</li>
          </ul>
          {renderBtn(0, active === null)}
        </div>

        {/* ── Scenario cards ── */}
        {scenarios.map((s, i) => {
          const isFeatured = i === scenarios.length - 1;
          const isActive = active === s.id;
          const icon = SCENARIO_ICONS[i] ?? '📋';

          return (
            <div key={s.id} className={cardClasses(isActive, isFeatured)}>
              {isAnyLoading && loading === s.id && (
                <div className="scenario-card-overlay"><span className="spinner-border" /></div>
              )}
              {isFeatured && <div className="scenario-featured-badge">Most complete</div>}

              <div className="scenario-card-eyebrow">Scenario {s.id}</div>
              <div className="scenario-card-icon">{icon}</div>
              <h3 className="scenario-card-title">{s.name}</h3>
              <p className="scenario-card-tagline">{s.matchCount} matches played</p>
              <p className="scenario-card-desc">{s.description}</p>
              <ul className="scenario-feature-list">
                <li><span className="scenario-check">✓</span> {s.matchCount} results in DB</li>
                <li><span className="scenario-check">✓</span> All standings updated</li>
                <li><span className="scenario-check">✓</span> Probabilities recalculated</li>
                <li><span className="scenario-check">✓</span> AI commentary regenerated</li>
              </ul>
              {renderBtn(s.id, isActive)}
            </div>
          );
        })}
      </div>

      <p className="text-muted mt-4" style={{ fontSize: '0.82rem' }}>
        Applying a scenario may take a few seconds — probabilities are recalculated via Monte Carlo
        simulation and AI commentary is invalidated so it regenerates fresh on next page visit.
      </p>
    </div>
  );
}