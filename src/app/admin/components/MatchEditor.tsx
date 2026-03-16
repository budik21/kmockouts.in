'use client';

import { useState, useCallback } from 'react';
import type { AdminMatch } from '../page';

interface MatchState {
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  status: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

function FlagIcon({ code, size = 'sm' }: { code: string; size?: string }) {
  if (!code) return <span>?</span>;
  const cls = code.length > 2 ? `fi fi-${code.slice(0, 2).toLowerCase()} fis fi-${code.toLowerCase()}` : `fi fi-${code.toLowerCase()}`;
  const sizeClass = size === 'lg' ? 'flag-lg' : size === 'md' ? 'flag-md' : 'flag-sm';
  return <span className={`${cls} ${sizeClass}`} />;
}

function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  nullable = false,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  label?: string;
}) {
  const display = value === null ? '–' : value;
  const canDec = value !== null && value > min;
  const canInc = value === null || value < max;

  return (
    <div className="admin-stepper">
      {label && <span className="admin-stepper-label">{label}</span>}
      <button
        type="button"
        className="admin-stepper-btn"
        disabled={!canDec}
        onClick={() => {
          if (value !== null && value > min) onChange(value - 1);
        }}
      >
        −
      </button>
      <span className="admin-stepper-value">{display}</span>
      <button
        type="button"
        className="admin-stepper-btn"
        onClick={() => {
          if (value === null) {
            onChange(nullable ? 0 : 0);
          } else if (value < max) {
            onChange(value + 1);
          }
        }}
        disabled={!canInc}
      >
        +
      </button>
    </div>
  );
}

function MatchCard({
  match,
  state,
  onUpdate,
  onSave,
}: {
  match: AdminMatch;
  state: MatchState;
  onUpdate: (patch: Partial<MatchState>) => void;
  onSave: () => void;
}) {
  const isDirty =
    state.homeGoals !== match.homeGoals ||
    state.awayGoals !== match.awayGoals ||
    state.homeYc !== match.homeYc ||
    state.homeYc2 !== match.homeYc2 ||
    state.homeRcDirect !== match.homeRcDirect ||
    state.awayYc !== match.awayYc ||
    state.awayYc2 !== match.awayYc2 ||
    state.awayRcDirect !== match.awayRcDirect ||
    state.status !== match.status;

  return (
    <div className={`admin-match-card ${state.saved ? 'admin-match-saved' : ''}`}>
      {/* Group badge + venue */}
      <div className="admin-match-header">
        <span className="admin-group-badge">Group {match.groupId}</span>
        <span className="admin-match-meta">
          R{match.round} &middot; {match.venue}
        </span>
      </div>

      {/* Score row */}
      <div className="admin-score-row">
        <div className="admin-team admin-team-home">
          <FlagIcon code={match.homeTeam.countryCode} size="md" />
          <span className="admin-team-name">{match.homeTeam.shortName}</span>
        </div>

        <div className="admin-score-steppers">
          <Stepper
            value={state.homeGoals}
            onChange={(v) => {
              const patch: Partial<MatchState> = { homeGoals: v };
              if (v !== null && state.awayGoals === null) patch.awayGoals = 0;
              if (v !== null && state.status === 'SCHEDULED') patch.status = 'FINISHED';
              onUpdate(patch);
            }}
            nullable
          />
          <span className="admin-score-separator">:</span>
          <Stepper
            value={state.awayGoals}
            onChange={(v) => {
              const patch: Partial<MatchState> = { awayGoals: v };
              if (v !== null && state.homeGoals === null) patch.homeGoals = 0;
              if (v !== null && state.status === 'SCHEDULED') patch.status = 'FINISHED';
              onUpdate(patch);
            }}
            nullable
          />
        </div>

        <div className="admin-team admin-team-away">
          <span className="admin-team-name">{match.awayTeam.shortName}</span>
          <FlagIcon code={match.awayTeam.countryCode} size="md" />
        </div>
      </div>

      {/* Cards row — home */}
      <div className="admin-cards-section">
        <div className="admin-cards-row">
          <span className="admin-cards-team-label">{match.homeTeam.shortName}</span>
          <Stepper label="YC" value={state.homeYc} onChange={(v) => onUpdate({ homeYc: v ?? 0 })} />
          <Stepper label="2YC" value={state.homeYc2} onChange={(v) => onUpdate({ homeYc2: v ?? 0 })} />
          <Stepper label="RC" value={state.homeRcDirect} onChange={(v) => onUpdate({ homeRcDirect: v ?? 0 })} />
        </div>
        <div className="admin-cards-row">
          <span className="admin-cards-team-label">{match.awayTeam.shortName}</span>
          <Stepper label="YC" value={state.awayYc} onChange={(v) => onUpdate({ awayYc: v ?? 0 })} />
          <Stepper label="2YC" value={state.awayYc2} onChange={(v) => onUpdate({ awayYc2: v ?? 0 })} />
          <Stepper label="RC" value={state.awayRcDirect} onChange={(v) => onUpdate({ awayRcDirect: v ?? 0 })} />
        </div>
      </div>

      {/* Status + Save */}
      <div className="admin-match-footer">
        <select
          className="form-select form-select-sm admin-status-select"
          value={state.status}
          onChange={(e) => onUpdate({ status: e.target.value })}
        >
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="LIVE">LIVE</option>
          <option value="FINISHED">FINISHED</option>
        </select>

        <button
          className={`btn btn-sm ${isDirty ? 'btn-warning' : 'btn-outline-secondary'} admin-save-btn`}
          onClick={onSave}
          disabled={state.saving || !isDirty}
        >
          {state.saving ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" />
              Saving...
            </>
          ) : state.saved && !isDirty ? (
            '✓ Saved'
          ) : (
            '💾 Save'
          )}
        </button>

        {state.error && (
          <span className="text-danger" style={{ fontSize: '0.75rem' }}>
            {state.error}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MatchEditor({
  initialMatches,
}: {
  initialMatches: AdminMatch[];
}) {
  const [states, setStates] = useState<Record<number, MatchState>>(() => {
    const init: Record<number, MatchState> = {};
    for (const m of initialMatches) {
      init[m.id] = {
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        homeYc: m.homeYc,
        homeYc2: m.homeYc2,
        homeRcDirect: m.homeRcDirect,
        awayYc: m.awayYc,
        awayYc2: m.awayYc2,
        awayRcDirect: m.awayRcDirect,
        status: m.status,
        saving: false,
        saved: false,
        error: null,
      };
    }
    return init;
  });

  const updateMatch = useCallback((matchId: number, patch: Partial<MatchState>) => {
    setStates((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], ...patch, saved: false },
    }));
  }, []);

  const saveMatch = useCallback(
    async (match: AdminMatch) => {
      const s = states[match.id];
      setStates((prev) => ({
        ...prev,
        [match.id]: { ...prev[match.id], saving: true, error: null },
      }));

      try {
        const res = await fetch('/api/admin/match/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId: match.id,
            homeGoals: s.homeGoals,
            awayGoals: s.awayGoals,
            homeYc: s.homeYc,
            homeYc2: s.homeYc2,
            homeRcDirect: s.homeRcDirect,
            awayYc: s.awayYc,
            awayYc2: s.awayYc2,
            awayRcDirect: s.awayRcDirect,
            status: s.status,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to save');
        }

        setStates((prev) => ({
          ...prev,
          [match.id]: { ...prev[match.id], saving: false, saved: true },
        }));
      } catch (err) {
        setStates((prev) => ({
          ...prev,
          [match.id]: {
            ...prev[match.id],
            saving: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          },
        }));
      }
    },
    [states],
  );

  // Group matches by date
  const matchesByDate = new Map<string, AdminMatch[]>();
  for (const m of initialMatches) {
    const date = m.kickOff.slice(0, 10); // YYYY-MM-DD
    if (!matchesByDate.has(date)) matchesByDate.set(date, []);
    matchesByDate.get(date)!.push(m);
  }

  const sortedDates = Array.from(matchesByDate.keys()).sort();

  return (
    <div className="admin-match-list">
      {sortedDates.map((date) => {
        const dayMatches = matchesByDate.get(date)!;
        const dateObj = new Date(date + 'T12:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        return (
          <div key={date} className="admin-day-group">
            <h3 className="admin-day-header">
              {dateStr}
              <span className="admin-day-count">{dayMatches.length} matches</span>
            </h3>
            <div className="admin-day-matches">
              {dayMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  state={states[m.id]}
                  onUpdate={(patch) => updateMatch(m.id, patch)}
                  onSave={() => saveMatch(m)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
