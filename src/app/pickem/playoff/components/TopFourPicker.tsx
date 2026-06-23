'use client';

import { useMemo, useState } from 'react';
import TeamCombobox from './TeamCombobox';
import type { PlayoffTeam, UserPlayoffPick } from '@/lib/playoff-data';
import { PLAYOFF_PICK_SLOTS, PLAYOFF_PICK_POINTS, type PlayoffPickSlot } from '@/lib/playoff-scoring';

interface Props {
  teams: PlayoffTeam[];
  initialPicks: UserPlayoffPick[];
  locked: boolean;
  picksLockAt: number | null;
}

const SLOT_META: Record<PlayoffPickSlot, { title: string; icon: string }> = {
  champion: { title: 'Champion', icon: '🥇' },
  runner_up: { title: 'Runner-up', icon: '🥈' },
  semifinalist_1: { title: 'Losing semifinalist', icon: '🥉' },
  semifinalist_2: { title: 'Losing semifinalist', icon: '🥉' },
};

export default function TopFourPicker({ teams, initialPicks, locked, picksLockAt }: Props) {
  const [picks, setPicks] = useState<Record<PlayoffPickSlot, number | null>>(() => {
    const base: Record<PlayoffPickSlot, number | null> = {
      champion: null, runner_up: null, semifinalist_1: null, semifinalist_2: null,
    };
    for (const p of initialPicks) {
      if ((PLAYOFF_PICK_SLOTS as string[]).includes(p.slot)) base[p.slot as PlayoffPickSlot] = p.teamId;
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const chosenIds = useMemo(() => {
    const s = new Set<number>();
    for (const slot of PLAYOFF_PICK_SLOTS) {
      const v = picks[slot];
      if (v != null) s.add(v);
    }
    return s;
  }, [picks]);

  const allFilled = PLAYOFF_PICK_SLOTS.every((s) => picks[s] != null);
  const pointsById = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const p of initialPicks) m.set(p.teamId, p.points);
    return m;
  }, [initialPicks]);

  const lockDate = picksLockAt ? new Date(picksLockAt) : null;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/playoff/picks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error ?? 'Could not save your picks' });
      } else {
        setMessage({ kind: 'ok', text: 'Your top-4 picks are saved.' });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — please try again.' });
    } finally {
      setSaving(false);
    }
  }

  if (teams.length === 0) {
    return (
      <div className="alert alert-info">
        The play-off bracket isn&apos;t set yet. Once the group stage finishes, the 32 qualified
        teams will appear here for you to pick.
      </div>
    );
  }

  return (
    <div className="playoff-topfour">
      <div className="playoff-section-head">
        <h2 className="playoff-section-title">🏅 Name your top 4</h2>
        <p className="playoff-section-sub">
          Champion ({PLAYOFF_PICK_POINTS.champion} pts), runner-up ({PLAYOFF_PICK_POINTS.runner_up} pts) and the
          two losing semifinalists ({PLAYOFF_PICK_POINTS.semifinalist_1} pts each). Four different teams.
        </p>
      </div>

      {locked ? (
        <div className="playoff-lock-banner">🔒 Top-4 picks are locked — the knockout stage has begun.</div>
      ) : lockDate ? (
        <div className="playoff-lock-hint">
          Picks lock on {lockDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {' '}(1 hour before the first match).
        </div>
      ) : null}

      <div className="playoff-topfour-grid">
        {PLAYOFF_PICK_SLOTS.map((slot) => {
          const meta = SLOT_META[slot];
          const teamId = picks[slot];
          const pts = teamId != null ? pointsById.get(teamId) : undefined;
          return (
            <div key={slot} className="playoff-slot">
              <div className="playoff-slot-label">
                <span className="playoff-slot-icon">{meta.icon}</span>
                <span>{meta.title}</span>
                <span className="playoff-slot-pts">+{PLAYOFF_PICK_POINTS[slot]}</span>
              </div>
              <TeamCombobox
                teams={teams}
                value={teamId}
                onChange={(id) => setPicks((p) => ({ ...p, [slot]: id }))}
                disabledTeamIds={chosenIds}
                disabled={locked}
                placeholder="Select a team…"
              />
              {pts != null && (
                <div className={`playoff-slot-result ${pts > 0 ? 'hit' : 'miss'}`}>
                  {pts > 0 ? `✓ +${pts} pts` : '— 0 pts'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!locked && (
        <div className="playoff-save-row">
          <button className="tipovacka-btn tipovacka-btn-primary" disabled={!allFilled || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save top-4 picks'}
          </button>
          {!allFilled && <span className="playoff-save-note">Fill all four slots to save.</span>}
          {message && (
            <span className={message.kind === 'ok' ? 'playoff-save-ok' : 'playoff-save-err'}>{message.text}</span>
          )}
        </div>
      )}
    </div>
  );
}
