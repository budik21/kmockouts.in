'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Scenario {
  id: number;
  name: string;
  description: string;
  matchCount: number;
}

export default function ScenarioSwitcher() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch('/api/scenarios');
      const data = await res.json();
      setScenarios(data.scenarios);
      setActive(data.active);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  async function applyScenario(scenarioId: number) {
    setLoading(true);
    try {
      const res = await fetch('/api/scenarios/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (data.success) {
        setActive(data.active);
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to apply scenario:', err);
    } finally {
      setLoading(false);
    }
  }

  if (scenarios.length === 0) return null;

  return (
    <div className="dropdown">
      <button
        className="btn btn-sm btn-outline-light dropdown-toggle"
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        disabled={loading}
        style={{ fontSize: '0.8rem' }}
      >
        {loading ? (
          <>
            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            Loading...
          </>
        ) : (
          <>
            {'\uD83E\uDDEA'} {active ? `Scenario ${active}` : 'Scenarios'}
          </>
        )}
      </button>
      <ul className="dropdown-menu dropdown-menu-end scenario-dropdown">
        <li>
          <h6 className="dropdown-header">Test Scenarios</h6>
        </li>
        <li>
          <button
            className={`dropdown-item ${active === null ? 'active' : ''}`}
            onClick={() => applyScenario(0)}
          >
            <strong>Reset</strong>
            <br />
            <small className="text-muted">Clean state — no results</small>
          </button>
        </li>
        <li><hr className="dropdown-divider" /></li>
        {scenarios.map((s) => (
          <li key={s.id}>
            <button
              className={`dropdown-item ${active === s.id ? 'active' : ''}`}
              onClick={() => applyScenario(s.id)}
            >
              <strong>#{s.id}: {s.name}</strong>
              <br />
              <small className="text-muted">
                {s.description} ({s.matchCount} matches)
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
