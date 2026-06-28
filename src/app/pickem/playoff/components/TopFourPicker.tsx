'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TeamCombobox from './TeamCombobox';
import type { PlayoffTeam, UserPlayoffPick } from '@/lib/playoff-data';
import {
  PLAYOFF_PICK_SLOTS,
  PLAYOFF_PICK_POINTS,
  PLAYOFF_PICK_WRONG_PLACE_POINTS,
  PLAYOFF_PICK_ALL_EXACT_BONUS,
  type PlayoffPickSlot,
} from '@/lib/playoff-scoring';

interface Props {
  teams: PlayoffTeam[];
  initialPicks: UserPlayoffPick[];
  locked: boolean;
  picksLockAt: number | null;
}

const SLOT_META: Record<PlayoffPickSlot, { title: string; icon: string }> = {
  champion: { title: '1st — Champion', icon: '🥇' },
  runner_up: { title: '2nd place', icon: '🥈' },
  third: { title: '3rd place', icon: '🥉' },
  fourth: { title: '4th place', icon: '🎖️' },
};

export default function TopFourPicker({ teams, initialPicks, locked, picksLockAt }: Props) {
  const [picks, setPicks] = useState<Record<PlayoffPickSlot, number | null>>(() => {
    const base: Record<PlayoffPickSlot, number | null> = {
      champion: null, runner_up: null, third: null, fourth: null,
    };
    for (const p of initialPicks) {
      if ((PLAYOFF_PICK_SLOTS as string[]).includes(p.slot)) base[p.slot as PlayoffPickSlot] = p.teamId;
    }
    return base;
  });
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errText, setErrText] = useState<string | null>(null);

  const keyOf = (p: Record<PlayoffPickSlot, number | null>) => PLAYOFF_PICK_SLOTS.map((s) => p[s] ?? '').join('|');
  const lastSavedKey = useRef<string>(keyOf((() => {
    const base: Record<PlayoffPickSlot, number | null> = { champion: null, runner_up: null, third: null, fourth: null };
    for (const p of initialPicks) if ((PLAYOFF_PICK_SLOTS as string[]).includes(p.slot)) base[p.slot as PlayoffPickSlot] = p.teamId;
    return base;
  })()));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chosenIds = useMemo(() => {
    const s = new Set<number>();
    for (const slot of PLAYOFF_PICK_SLOTS) {
      const v = picks[slot];
      if (v != null) s.add(v);
    }
    return s;
  }, [picks]);

  const allFilled = PLAYOFF_PICK_SLOTS.every((s) => picks[s] != null);
  const pointsBySlot = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of initialPicks) m.set(p.slot, p.points);
    return m;
  }, [initialPicks]);
  const championPts = pointsBySlot.get('champion');
  const bonusAchieved = championPts != null && championPts >= PLAYOFF_PICK_POINTS.champion + PLAYOFF_PICK_ALL_EXACT_BONUS;

  const lockDate = picksLockAt ? new Date(picksLockAt) : null;

  // Auto-save: once all four slots are filled (the comboboxes already enforce
  // four distinct teams), debounce and persist. Only fires when the selection
  // changed from what's saved, so it never re-saves on mount.
  useEffect(() => {
    if (locked || !allFilled) return;
    const key = keyOf(picks);
    if (key === lastSavedKey.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setAutoState('saving');
      setErrText(null);
      fetch('/api/playoff/picks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks }),
      })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) { setAutoState('error'); setErrText(data.error ?? 'Could not save your picks'); }
          else { lastSavedKey.current = key; setAutoState('saved'); }
        })
        .catch(() => { setAutoState('error'); setErrText('Network error — your picks were not saved.'); });
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, locked, allFilled]);

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
        <h2 className="playoff-section-title">🏅 Name the final top 4</h2>
        <p className="playoff-section-sub">
          Champion ({PLAYOFF_PICK_POINTS.champion} pts); 2nd, 3rd &amp; 4th ({PLAYOFF_PICK_POINTS.runner_up} pts each).
          A picked team that finishes in the top 4 at another place scores {PLAYOFF_PICK_WRONG_PLACE_POINTS} pts.
          <br />🎉 <strong>BONUS:</strong> get all four exactly right for an extra +{PLAYOFF_PICK_ALL_EXACT_BONUS} points. Four different teams.
        </p>
      </div>

      {bonusAchieved && (
        <div className="playoff-lock-banner">🎉 All four placings exactly right — +{PLAYOFF_PICK_ALL_EXACT_BONUS} bonus!</div>
      )}

      {locked ? (
        <div className="playoff-lock-banner">🔒 Top-4 picks are locked — the knockout stage has begun.</div>
      ) : lockDate ? (
        <div className="playoff-lock-hint">
          Picks lock on {lockDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {' '}(when the first match kicks off).
        </div>
      ) : null}

      <div className="playoff-topfour-grid">
        {PLAYOFF_PICK_SLOTS.map((slot) => {
          const meta = SLOT_META[slot];
          const teamId = picks[slot];
          const pts = pointsBySlot.get(slot);
          let badge: React.ReactNode = null;
          if (pts != null) {
            const isChampion = slot === 'champion';
            // The +50 all-exact bonus is folded into the champion pick; exclude
            // it here (it's announced in the banner above) so 1st place shows
            // just its own +40.
            const display = isChampion && pts >= PLAYOFF_PICK_POINTS.champion + PLAYOFF_PICK_ALL_EXACT_BONUS
              ? PLAYOFF_PICK_POINTS.champion
              : pts;
            // Colour-coded like the match badges: 0 → red, scored → green, and
            // correctly naming the world champion → gold.
            const cls = display === 0 ? 'red'
              : (isChampion && display >= PLAYOFF_PICK_POINTS.champion) ? 'gold'
              : 'green';
            const reason = pts === 0
              ? 'not in the top 4'
              : pts === PLAYOFF_PICK_WRONG_PLACE_POINTS
              ? 'right team, wrong place'
              : isChampion ? 'champion — spot on!' : 'exact placing';
            badge = (
              <div className="playoff-slot-result-row">
                <div className={`playoff-slot-badge ${cls}`}>{display > 0 ? `+${display}` : '0'} pts</div>
                <span className="playoff-slot-reason">{reason}</span>
              </div>
            );
          }
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
              {badge}
            </div>
          );
        })}
      </div>

      {!locked && (
        <div className="playoff-save-row">
          <span className="playoff-autosave" aria-live="polite">
            {!allFilled
              ? 'Pick all four — your picks save automatically.'
              : autoState === 'saving' ? '💾 Saving…'
              : autoState === 'error' ? `⚠️ ${errText ?? 'Could not save'}`
              : autoState === 'saved' ? '✅ Saved automatically'
              : '✅ All four picked — saved automatically.'}
          </span>
        </div>
      )}
    </div>
  );
}
