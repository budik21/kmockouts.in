'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KnockoutMatchView } from '@/lib/playoff-data';
import type { KnockoutRoundName } from '@/lib/knockout-bracket';

const ROUND_ORDER: { id: KnockoutRoundName; label: string }[] = [
  { id: 'r32', label: 'Round of 32' },
  { id: 'r16', label: 'Round of 16' },
  { id: 'qf', label: 'Quarterfinals' },
  { id: 'sf', label: 'Semifinals' },
  { id: 'thirdPlace', label: '3rd Place' },
  { id: 'final', label: 'Final' },
];

interface Draft {
  homeGoals: string; awayGoals: string;
  homeGoalsEt: string; awayGoalsEt: string;
  homePens: string; awayPens: string;
  status: string;
  saving: boolean;
  error: string | null;
  saved: boolean;
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function toDraft(m: KnockoutMatchView): Draft {
  const s = (v: number | null) => (v == null ? '' : String(v));
  return {
    homeGoals: s(m.homeGoals), awayGoals: s(m.awayGoals),
    homeGoalsEt: s(m.homeGoalsEt), awayGoalsEt: s(m.awayGoalsEt),
    homePens: s(m.homePens), awayPens: s(m.awayPens),
    status: m.status,
    saving: false, error: null, saved: false,
  };
}

const inputStyle: React.CSSProperties = {
  width: '3rem', textAlign: 'center', background: 'var(--wc-bg, #1a1a1a)',
  color: 'var(--wc-text)', border: '1px solid var(--wc-border)', borderRadius: 4, padding: '0.25rem',
};

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

  const teamName = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of matches) {
      if (m.homeTeam) map.set(m.homeTeam.id, m.homeTeam.name);
      if (m.awayTeam) map.set(m.awayTeam.id, m.awayTeam.name);
    }
    return map;
  }, [matches]);

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

  async function save(num: number) {
    const d = drafts[num];
    patch(num, { saving: true });
    try {
      const res = await fetch('/api/admin/knockout/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchNumber: num,
          homeGoals: numOrNull(d.homeGoals), awayGoals: numOrNull(d.awayGoals),
          homeGoalsEt: numOrNull(d.homeGoalsEt), awayGoalsEt: numOrNull(d.awayGoalsEt),
          homePens: numOrNull(d.homePens), awayPens: numOrNull(d.awayPens),
          status: d.status,
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
                const advName = m.advancingTeamId != null ? teamName.get(m.advancingTeamId) : null;
                return (
                  <div key={m.matchNumber} style={{
                    border: '1px solid var(--wc-border)', borderRadius: 6, padding: '0.6rem 0.8rem',
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <div style={{ color: 'var(--wc-text)', fontWeight: 600, minWidth: '16rem' }}>
                        <span style={{ color: 'var(--wc-text-muted)', fontWeight: 400 }}>#{m.matchNumber} </span>
                        {m.homeTeam?.name ?? 'TBD'} <span style={{ color: 'var(--wc-text-muted)' }}>vs</span> {m.awayTeam?.name ?? 'TBD'}
                      </div>
                      {advName && (
                        <span style={{ color: 'var(--wc-accent)', fontSize: '0.8rem' }}>→ {advName} advances</span>
                      )}
                    </div>

                    <div className="d-flex align-items-center gap-3 flex-wrap mt-2">
                      <ScoreGroup label="90′" h={d.homeGoals} a={d.awayGoals}
                        onH={(v) => patch(m.matchNumber, { homeGoals: v })} onA={(v) => patch(m.matchNumber, { awayGoals: v })} />
                      <ScoreGroup label="A.E.T." h={d.homeGoalsEt} a={d.awayGoalsEt}
                        onH={(v) => patch(m.matchNumber, { homeGoalsEt: v })} onA={(v) => patch(m.matchNumber, { awayGoalsEt: v })} />
                      <ScoreGroup label="Pens" h={d.homePens} a={d.awayPens}
                        onH={(v) => patch(m.matchNumber, { homePens: v })} onA={(v) => patch(m.matchNumber, { awayPens: v })} />

                      <label style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>
                        Status{' '}
                        <select value={d.status} onChange={(e) => patch(m.matchNumber, { status: e.target.value })}
                          style={{ ...inputStyle, width: 'auto', textAlign: 'left' }}>
                          <option value="SCHEDULED">SCHEDULED</option>
                          <option value="FINISHED">FINISHED</option>
                        </select>
                      </label>

                      <button className="btn btn-sm btn-primary" disabled={d.saving || !m.participantsKnown}
                        onClick={() => save(m.matchNumber)}>
                        {d.saving ? 'Saving…' : d.saved ? '✓ Saved' : 'Save'}
                      </button>
                      {!m.participantsKnown && (
                        <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.75rem' }}>participants unknown</span>
                      )}
                      {d.error && <span style={{ color: '#ff6b6b', fontSize: '0.8rem' }}>{d.error}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreGroup({ label, h, a, onH, onA }: {
  label: string; h: string; a: string; onH: (v: string) => void; onA: (v: string) => void;
}) {
  return (
    <div className="d-flex align-items-center gap-1">
      <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.75rem', width: '2.6rem' }}>{label}</span>
      <input style={inputStyle} inputMode="numeric" value={h} onChange={(e) => onH(e.target.value)} />
      <span style={{ color: 'var(--wc-text-muted)' }}>:</span>
      <input style={inputStyle} inputMode="numeric" value={a} onChange={(e) => onA(e.target.value)} />
    </div>
  );
}
