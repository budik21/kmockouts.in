'use client';

import { useCallback, useEffect, useState } from 'react';
import ArrowStepper from '@/app/components/ArrowStepper';
import type { KnockoutMatchView } from '@/lib/playoff-data';
import type { KnockoutRoundName } from '@/lib/knockout-bracket';
import { computeAdvancing } from '@/lib/playoff-scoring';

const ROUND_ORDER: { id: KnockoutRoundName; label: string }[] = [
  { id: 'r32', label: 'Round of 32' },
  { id: 'r16', label: 'Round of 16' },
  { id: 'qf', label: 'Quarterfinals' },
  { id: 'sf', label: 'Semifinals' },
  { id: 'thirdPlace', label: '3rd Place' },
  { id: 'final', label: 'Final' },
];

interface Draft {
  homeGoals: number | null; awayGoals: number | null;
  homeGoalsEt: number | null; awayGoalsEt: number | null;
  homePens: number | null; awayPens: number | null;
  saving: boolean;
  error: string | null;
  saved: boolean;
}

function toDraft(m: KnockoutMatchView): Draft {
  return {
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    homeGoalsEt: m.homeGoalsEt, awayGoalsEt: m.awayGoalsEt,
    homePens: m.homePens, awayPens: m.awayPens,
    saving: false, error: null, saved: false,
  };
}

export default function KnockoutEditor() {
  const [matches, setMatches] = useState<KnockoutMatchView[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/knockout/list');
      const data = await res.json();
      const ms: KnockoutMatchView[] = data.matches ?? [];
      setMatches(ms);
      const d: Record<number, Draft> = {};
      for (const m of ms) d[m.matchNumber] = toDraft(m);
      setDrafts(d);
    } catch {
      setGlobalMsg('Failed to load knockout matches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    setGlobalMsg(null);
    try {
      const res = await fetch('/api/admin/knockout/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setGlobalMsg(data.error ?? 'Sync failed');
      else { setGlobalMsg(`Bracket synced — ${data.matches} matches updated.`); await load(); }
    } catch {
      setGlobalMsg('Sync failed (network).');
    } finally {
      setSyncing(false);
    }
  }

  function patch(num: number, p: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [num]: { ...d[num], ...p, saved: false, error: null } }));
  }

  async function save(num: number, status: 'SCHEDULED' | 'FINISHED') {
    const d = drafts[num];
    patch(num, { saving: true });
    try {
      const res = await fetch('/api/admin/knockout/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchNumber: num,
          homeGoals: d.homeGoals, awayGoals: d.awayGoals,
          homeGoalsEt: d.homeGoalsEt, awayGoalsEt: d.awayGoalsEt,
          homePens: d.homePens, awayPens: d.awayPens,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDrafts((dd) => ({ ...dd, [num]: { ...dd[num], saving: false, error: data.error ?? 'Save failed' } }));
      } else {
        setDrafts((dd) => ({ ...dd, [num]: { ...dd[num], saving: false, saved: true } }));
        await load(); // refresh advancing + propagated participants
      }
    } catch {
      setDrafts((dd) => ({ ...dd, [num]: { ...dd[num], saving: false, error: 'Network error' } }));
    }
  }

  if (loading) return <p style={{ color: 'var(--wc-text-muted)' }}>Loading knockout bracket…</p>;

  const byRound = new Map<KnockoutRoundName, KnockoutMatchView[]>();
  for (const r of ROUND_ORDER) byRound.set(r.id, []);
  for (const m of matches) byRound.get(m.round)?.push(m);

  return (
    <div>
      <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
        <button className="btn btn-sm btn-outline-light" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : '↻ Sync bracket from standings'}
        </button>
        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
          Resolves R32 participants from group standings and propagates winners through the bracket.
        </span>
        {globalMsg && <span style={{ color: 'var(--wc-accent)', fontSize: '0.85rem' }}>{globalMsg}</span>}
      </div>

      {matches.length === 0 && (
        <p style={{ color: 'var(--wc-text-muted)' }}>
          No knockout matches yet. Click <strong>Sync bracket from standings</strong> once the group stage is far enough along.
        </p>
      )}

      {ROUND_ORDER.map(({ id, label }) => {
        const ms = byRound.get(id) ?? [];
        if (ms.length === 0) return null;
        return (
          <div key={id} style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--wc-text)', fontSize: '1.05rem', marginBottom: '0.75rem' }}>{label}</h3>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {ms.map((m) => {
                const d = drafts[m.matchNumber];
                if (!d) return null;
                return (
                  <KnockoutResultCard
                    key={m.matchNumber}
                    match={m}
                    draft={d}
                    onPatch={(p) => patch(m.matchNumber, p)}
                    onSave={(status) => save(m.matchNumber, status)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KnockoutResultCard({
  match, draft, onPatch, onSave,
}: {
  match: KnockoutMatchView;
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
  onSave: (status: 'SCHEDULED' | 'FINISHED') => void;
}) {
  const homeName = match.homeTeam?.name ?? 'TBD';
  const awayName = match.awayTeam?.name ?? 'TBD';

  const values = [draft.homeGoals, draft.awayGoals, draft.homeGoalsEt, draft.awayGoalsEt, draft.homePens, draft.awayPens];
  const allEmpty = values.every((v) => v == null);
  const hasNinety = draft.homeGoals != null && draft.awayGoals != null;

  // Extra time is cumulative — neither side's ET total may be below its 90' score.
  const etInvalid =
    (draft.homeGoalsEt != null && draft.homeGoals != null && draft.homeGoalsEt < draft.homeGoals) ||
    (draft.awayGoalsEt != null && draft.awayGoals != null && draft.awayGoalsEt < draft.awayGoals);

  // Live winner derivation from the entered result.
  const advancingId = match.participantsKnown
    ? computeAdvancing({
        homeTeamId: match.homeTeam!.id, awayTeamId: match.awayTeam!.id,
        homeGoals: draft.homeGoals, awayGoals: draft.awayGoals,
        homeGoalsEt: draft.homeGoalsEt, awayGoalsEt: draft.awayGoalsEt,
        homePens: draft.homePens, awayPens: draft.awayPens,
      })
    : null;
  const advancingName = advancingId == null ? null
    : advancingId === match.homeTeam?.id ? homeName
    : advancingId === match.awayTeam?.id ? awayName : null;

  // A result may be saved only when it determines who advances. Clearing back to
  // an unplayed state (all fields empty) is also allowed.
  const decided = match.participantsKnown && hasNinety && !etInvalid && advancingId != null;
  const canSave = !match.participantsKnown ? false : allEmpty || decided;

  let hint: string | null = null;
  if (!match.participantsKnown) hint = 'participants unknown';
  else if (allEmpty) hint = null;
  else if (!hasNinety) hint = 'Enter the full 90′ score';
  else if (etInvalid) hint = 'Extra-time score cannot be lower than the 90′ score';
  else if (advancingId == null) hint = 'Level — add extra time and/or penalties to decide who advances';

  const stepper = (
    value: number | null,
    key: keyof Draft,
    max: number,
  ) => (
    <ArrowStepper value={value} onChange={(v) => onPatch({ [key]: v } as Partial<Draft>)} nullable max={max} />
  );

  return (
    <div style={{
      border: '1px solid var(--wc-border)', borderRadius: 6, padding: '0.6rem 0.8rem',
      background: 'rgba(255,255,255,0.02)',
    }}>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div style={{ color: 'var(--wc-text)', fontWeight: 600, minWidth: '16rem' }}>
          <span style={{ color: 'var(--wc-text-muted)', fontWeight: 400 }}>#{match.matchNumber} </span>
          {homeName} <span style={{ color: 'var(--wc-text-muted)' }}>vs</span> {awayName}
        </div>
        <span style={{ fontSize: '0.8rem', color: advancingName ? 'var(--wc-accent)' : 'var(--wc-text-muted)' }}>
          {advancingName ? `→ ${advancingName} advances` : '→ winner undecided'}
        </span>
      </div>

      <div className="d-flex align-items-start gap-4 flex-wrap mt-2">
        <ScoreGroup label="90′" home={stepper(draft.homeGoals, 'homeGoals', 20)} away={stepper(draft.awayGoals, 'awayGoals', 20)} />
        <ScoreGroup label="A.E.T." home={stepper(draft.homeGoalsEt, 'homeGoalsEt', 20)} away={stepper(draft.awayGoalsEt, 'awayGoalsEt', 20)} />
        <ScoreGroup label="Pens" home={stepper(draft.homePens, 'homePens', 30)} away={stepper(draft.awayPens, 'awayPens', 30)} />

        <div className="d-flex flex-column gap-1">
          <button
            className="btn btn-sm btn-primary"
            disabled={draft.saving || !canSave}
            onClick={() => onSave(allEmpty ? 'SCHEDULED' : 'FINISHED')}
            title={!canSave && hint ? hint : undefined}
          >
            {draft.saving ? 'Saving…' : draft.saved ? '✓ Saved' : allEmpty ? 'Clear' : 'Save result'}
          </button>
        </div>
      </div>

      {hint && !draft.error && (
        <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.78rem', marginTop: '0.4rem' }}>⚠️ {hint}</div>
      )}
      {draft.error && <div style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.4rem' }}>{draft.error}</div>}
    </div>
  );
}

function ScoreGroup({ label, home, away }: { label: string; home: React.ReactNode; away: React.ReactNode }) {
  return (
    <div className="d-flex flex-column align-items-center gap-1">
      <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.75rem' }}>{label}</span>
      <div className="d-flex align-items-center gap-2">
        {home}
        <span style={{ color: 'var(--wc-text-muted)' }}>:</span>
        {away}
      </div>
    </div>
  );
}
