'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { AdminMatch } from '../dashboard/page';
import { YellowCardIcon, SecondYellowIcon, RedCardIcon, YellowAndRedCardIcon } from '@/app/components/CardIcons';
import ArrowStepper from '@/app/components/ArrowStepper';
import AdminActionWidget from './AdminActionWidget';

interface MatchEditorProps {
  initialMatches: AdminMatch[];
  isSuperadmin?: boolean;
}

interface MatchState {
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  homeYcRc: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  awayYcRc: number;
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

/** Format kick-off time in user's local timezone */
function formatKickOff(kickOff: string): string {
  try {
    const d = new Date(kickOff);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Card stepper: icon on left, arrows+number on right */
function CardStepper({
  value,
  onChange,
  icon,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="card-stepper">
      <div className="card-stepper-icon">{icon}</div>
      <span className="card-stepper-label">{label}</span>
      <ArrowStepper value={value} onChange={(v) => onChange(v ?? 0)} />
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
    state.homeYcRc !== match.homeYcRc ||
    state.awayYc !== match.awayYc ||
    state.awayYc2 !== match.awayYc2 ||
    state.awayRcDirect !== match.awayRcDirect ||
    state.awayYcRc !== match.awayYcRc ||
    state.status !== match.status;

  const kickOffTime = useMemo(() => formatKickOff(match.kickOff), [match.kickOff]);
  const groupUrl = `/worldcup2026/group-${match.groupId.toLowerCase()}`;
  const homeTeamUrl = `/worldcup2026/${match.groupId}/team/${match.homeTeamId}`;
  const awayTeamUrl = `/worldcup2026/${match.groupId}/team/${match.awayTeamId}`;

  return (
    <div className={`admin-match-card ${state.saved ? 'admin-match-saved' : ''}`}>
      {/* Group badge + kick-off + venue */}
      <div className="admin-match-header">
        <Link href={groupUrl} className="admin-group-badge">Group {match.groupId}</Link>
        <span className="admin-match-meta">
          {kickOffTime && <>{kickOffTime} &middot; </>}
          R{match.round} &middot; {match.venue}
        </span>
      </div>

      {/* Grid: home cards | center (teams + score) | away cards */}
      <div className="admin-grid">
        {/* Home cards column */}
        <div className="admin-cards-col admin-cards-home">
          <CardStepper label="YC" icon={<YellowCardIcon />} value={state.homeYc} onChange={(v) => onUpdate({ homeYc: v })} />
          <CardStepper label="YRC" icon={<SecondYellowIcon />} value={state.homeYc2} onChange={(v) => onUpdate({ homeYc2: v })} />
          <CardStepper label="RC" icon={<RedCardIcon />} value={state.homeRcDirect} onChange={(v) => onUpdate({ homeRcDirect: v })} />
          <CardStepper label="Y+RC" icon={<YellowAndRedCardIcon />} value={state.homeYcRc} onChange={(v) => onUpdate({ homeYcRc: v })} />
        </div>

        {/* Center column: team names row 1, score rows 2-4 */}
        <div className="admin-center-col">
          <div className="admin-teams-row">
            <Link href={homeTeamUrl} className="admin-team-label admin-team-label-home">
              <FlagIcon code={match.homeTeam.countryCode} size="md" />
              <span className="admin-team-name">{match.homeTeam.shortName}</span>
            </Link>
            <span className="admin-teams-vs">vs</span>
            <Link href={awayTeamUrl} className="admin-team-label admin-team-label-away">
              <span className="admin-team-name">{match.awayTeam.shortName}</span>
              <FlagIcon code={match.awayTeam.countryCode} size="md" />
            </Link>
          </div>
          <div className="admin-score-center">
            <div className="admin-score-box">
              <ArrowStepper
                value={state.homeGoals}
                onChange={(v) => {
                  const patch: Partial<MatchState> = { homeGoals: v };
                  if (v !== null && state.awayGoals === null) patch.awayGoals = 0;
                  if (v !== null && state.status === 'SCHEDULED') patch.status = 'FINISHED';
                  onUpdate(patch);
                }}
                nullable
                big
              />
              <span className="admin-score-separator">:</span>
              <ArrowStepper
                value={state.awayGoals}
                onChange={(v) => {
                  const patch: Partial<MatchState> = { awayGoals: v };
                  if (v !== null && state.homeGoals === null) patch.homeGoals = 0;
                  if (v !== null && state.status === 'SCHEDULED') patch.status = 'FINISHED';
                  onUpdate(patch);
                }}
                nullable
                big
              />
            </div>
          </div>
        </div>

        {/* Away cards column */}
        <div className="admin-cards-col admin-cards-away">
          <CardStepper label="YC" icon={<YellowCardIcon />} value={state.awayYc} onChange={(v) => onUpdate({ awayYc: v })} />
          <CardStepper label="YRC" icon={<SecondYellowIcon />} value={state.awayYc2} onChange={(v) => onUpdate({ awayYc2: v })} />
          <CardStepper label="RC" icon={<RedCardIcon />} value={state.awayRcDirect} onChange={(v) => onUpdate({ awayRcDirect: v })} />
          <CardStepper label="Y+RC" icon={<YellowAndRedCardIcon />} value={state.awayYcRc} onChange={(v) => onUpdate({ awayYcRc: v })} />
        </div>
      </div>

      {/* Status + Save — centered below score */}
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
            'Save'
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

function RecalculateGroupButton({ groupId }: { groupId: string }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const run = async () => {
    setStatus('running');
    setMessage('');
    try {
      const res = await fetch('/api/admin/group/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to recalculate');
      }
      setStatus('done');
      setMessage(data.message || `Group ${groupId} recalculated`);
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--wc-border)',
        borderRadius: '0.375rem',
        flexWrap: 'wrap',
      }}
    >
      <button
        className="btn btn-sm btn-warning"
        onClick={run}
        disabled={status === 'running'}
      >
        {status === 'running' ? (
          <>
            <span className="spinner-border spinner-border-sm me-1" />
            Recalculating group {groupId}…
          </>
        ) : (
          <>🔄 Recalculate Group {groupId}</>
        )}
      </button>
      <span style={{ fontSize: '0.85rem', color: 'var(--wc-text-muted)', flex: 1 }}>
        Re-runs probabilities, AI interpretations and tip scoring from the saved match
        results in group {groupId}, and purges caches.
      </span>
      {status === 'done' && (
        <span style={{ color: '#4caf50', fontSize: '0.85rem', fontWeight: 500 }}>
          ✓ {message}
        </span>
      )}
      {status === 'error' && (
        <span style={{ color: '#f44336', fontSize: '0.85rem', fontWeight: 500 }}>
          ✗ {message}
        </span>
      )}
    </div>
  );
}

export default function MatchEditor({
  initialMatches,
  isSuperadmin = false,
}: MatchEditorProps) {
  const [groupFilter, setGroupFilter] = useState<string>('ALL');

  const groups = useMemo(() => {
    const ids = Array.from(new Set(initialMatches.map((m) => m.groupId))).sort();
    return ids;
  }, [initialMatches]);

  const filteredMatches = useMemo(
    () => (groupFilter === 'ALL' ? initialMatches : initialMatches.filter((m) => m.groupId === groupFilter)),
    [initialMatches, groupFilter],
  );

  const [states, setStates] = useState<Record<number, MatchState>>(() => {
    const init: Record<number, MatchState> = {};
    for (const m of initialMatches) {
      init[m.id] = {
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        homeYc: m.homeYc,
        homeYc2: m.homeYc2,
        homeRcDirect: m.homeRcDirect,
        homeYcRc: m.homeYcRc,
        awayYc: m.awayYc,
        awayYc2: m.awayYc2,
        awayRcDirect: m.awayRcDirect,
        awayYcRc: m.awayYcRc,
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
            homeYcRc: s.homeYcRc,
            awayYc: s.awayYc,
            awayYc2: s.awayYc2,
            awayRcDirect: s.awayRcDirect,
            awayYcRc: s.awayYcRc,
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

        // Auto-clear saved indicator after 3 seconds
        setTimeout(() => {
          setStates((prev) => ({
            ...prev,
            [match.id]: { ...prev[match.id], saved: false },
          }));
        }, 3000);
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
  for (const m of filteredMatches) {
    const date = m.kickOff.slice(0, 10);
    if (!matchesByDate.has(date)) matchesByDate.set(date, []);
    matchesByDate.get(date)!.push(m);
  }

  const sortedDates = Array.from(matchesByDate.keys()).sort();

  return (
    <div className="admin-match-list">
      <AdminActionWidget
        hidden={!isSuperadmin}
        title="Delete all results"
        description="Clear all match scores, cards, and statuses. All tipster tips will be recalculated to 0 points. Tipster accounts and their predictions remain intact."
        buttonLabel="🗑️ Delete all results"
        buttonVariant="danger"
        inProgressLabel="Deleting all results…"
        completedLabel="All results deleted"
        confirm={{
          title: '⚠️ Delete all match results?',
          body: (
            <>
              <p>
                This action will <strong>delete all match results</strong> and recalculate all
                tipster scores to 0 points.
              </p>
              <p style={{ marginBottom: '0.75rem' }}>
                <strong>This will:</strong>
              </p>
              <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
                <li>Clear all match scores (reset to no result)</li>
                <li>Clear all cards (yellow, red, second yellow)</li>
                <li>Recalculate all tipster tips to 0 points</li>
                <li>Clear AI prediction interpretations</li>
                <li>Refresh all caches</li>
              </ul>
              <p style={{ marginBottom: 0, color: 'var(--wc-accent)' }}>
                Tipster accounts and their predictions remain intact. This action cannot be undone.
              </p>
            </>
          ),
          confirmLabel: 'Delete all results',
        }}
        run={async () => {
          const res = await fetch('/api/admin/pickem/clear-results', { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'Failed to clear results');
          }
          return data.message;
        }}
      />

      <div className="admin-group-filter">
        <button
          className={`btn btn-sm ${groupFilter === 'ALL' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setGroupFilter('ALL')}
        >
          All
        </button>
        {groups.map((g) => (
          <button
            key={g}
            className={`btn btn-sm ${groupFilter === g ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setGroupFilter(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {groupFilter !== 'ALL' && (
        <RecalculateGroupButton groupId={groupFilter} />
      )}
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
