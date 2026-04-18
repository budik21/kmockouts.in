'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScenarioMeta } from '@/app/worldcup2026/scenarios/page';
import { ConfirmModal } from '@/app/admin/components/AdminActionWidget';

interface Props {
  scenarios: ScenarioMeta[];
  active: number | null;
  /** When true, apply requires confirmation in a modal (admin flow). */
  requireConfirm?: boolean;
}

const SCENARIO_ICONS = ['🏟️', '⚽', '🏆', '🎯'];

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'confirming'; scenarioId: number; label: string }
  | { kind: 'running'; scenarioId: number }
  | { kind: 'done'; scenarioId: number }
  | { kind: 'error'; scenarioId: number; message: string };

export default function ScenarioPicker({ scenarios, active, requireConfirm = false }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ApplyState>({ kind: 'idle' });

  const isAnyBusy = state.kind === 'running' || state.kind === 'confirming';

  async function runApply(scenarioId: number) {
    setState({ kind: 'running', scenarioId });
    try {
      const res = await fetch('/api/scenarios/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to apply scenario');
      }
      setState({ kind: 'done', scenarioId });
    } catch (err) {
      setState({
        kind: 'error',
        scenarioId,
        message: err instanceof Error ? err.message : 'Network error — please try again',
      });
    }
  }

  function handleApply(scenarioId: number, label: string) {
    if (requireConfirm) {
      setState({ kind: 'confirming', scenarioId, label });
    } else {
      void runApply(scenarioId);
    }
  }

  useEffect(() => {
    if (state.kind === 'done') {
      const refresh = setTimeout(() => router.refresh(), 0);
      const reset = setTimeout(() => setState({ kind: 'idle' }), 3000);
      return () => {
        clearTimeout(refresh);
        clearTimeout(reset);
      };
    }
    if (state.kind === 'error') {
      const t = setTimeout(() => setState({ kind: 'idle' }), 5000);
      return () => clearTimeout(t);
    }
  }, [state, router]);

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

  function renderBtn(scenarioId: number, isActive: boolean, label: string) {
    const isThisRunning = state.kind === 'running' && state.scenarioId === scenarioId;
    const isThisDone = state.kind === 'done' && state.scenarioId === scenarioId;
    const isThisError = state.kind === 'error' && state.scenarioId === scenarioId;

    if (isThisRunning) {
      return (
        <button className={btnClasses(isActive)} disabled>
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          Applying…
        </button>
      );
    }
    if (isThisDone) {
      return (
        <button className={btnClasses(isActive)} disabled style={{ backgroundColor: '#4caf50', color: '#fff' }}>
          ✓ Applied
        </button>
      );
    }
    if (isThisError) {
      return (
        <button className={btnClasses(isActive)} disabled style={{ backgroundColor: '#f44336', color: '#fff' }}>
          ✗ {state.message}
        </button>
      );
    }

    return (
      <button
        className={btnClasses(isActive)}
        disabled={isActive || isAnyBusy}
        onClick={() => handleApply(scenarioId, label)}
      >
        {isActive ? '✓ Currently Active' : 'Apply'}
      </button>
    );
  }

  function renderOverlay(scenarioId: number) {
    if (state.kind === 'running' && state.scenarioId === scenarioId) {
      return (
        <div className="scenario-card-overlay">
          <span className="spinner-border" />
        </div>
      );
    }
    return null;
  }

  return (
    <div>
      <div className="scenario-cards">
        {/* ── Reset card ── */}
        <div className={cardClasses(active === null)}>
          {renderOverlay(0)}
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
          {renderBtn(0, active === null, 'Reset')}
        </div>

        {/* ── Scenario cards ── */}
        {scenarios.map((s, i) => {
          const isFeatured = i === scenarios.length - 1;
          const isActive = active === s.id;
          const icon = SCENARIO_ICONS[i] ?? '📋';

          return (
            <div key={s.id} className={cardClasses(isActive, isFeatured)}>
              {renderOverlay(s.id)}
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
              {renderBtn(s.id, isActive, s.name)}
            </div>
          );
        })}
      </div>

      <p className="text-muted mt-4" style={{ fontSize: '0.82rem' }}>
        Applying a scenario may take a few seconds — probabilities are recalculated via Monte Carlo
        simulation and AI commentary is invalidated so it regenerates fresh on next page visit.
      </p>

      {state.kind === 'confirming' && (
        <ConfirmModal
          variant="accent"
          config={{
            title: `🎬 Apply scenario "${state.label}"?`,
            body: (
              <>
                <p>
                  This will overwrite all current match results and recalculate probabilities, AI
                  commentary, and tipster scores.
                </p>
                <p style={{ marginBottom: 0, color: 'var(--wc-accent)' }}>
                  Current data will be lost.
                </p>
              </>
            ),
            confirmLabel: 'Apply scenario',
          }}
          onConfirm={() => {
            const id = state.scenarioId;
            void runApply(id);
          }}
          onCancel={() => setState({ kind: 'idle' })}
        />
      )}
    </div>
  );
}
