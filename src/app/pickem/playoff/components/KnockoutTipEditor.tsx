'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ArrowStepper from '@/app/components/ArrowStepper';
import type { KnockoutMatchView, UserKnockoutTip, PlayoffTeam } from '@/lib/playoff-data';
import { isTipLocked } from '@/lib/tip-lock';
import { KO_EXACT_POINTS, KO_ADVANCE_POINTS } from '@/lib/playoff-scoring';
import type { KnockoutRoundName } from '@/lib/knockout-bracket';

interface Props {
  matches: KnockoutMatchView[];
  userTips: UserKnockoutTip[];
}

const ROUND_ORDER: { id: KnockoutRoundName; label: string }[] = [
  { id: 'r32', label: 'Round of 32' },
  { id: 'r16', label: 'Round of 16' },
  { id: 'qf', label: 'Quarterfinals' },
  { id: 'sf', label: 'Semifinals' },
  { id: 'thirdPlace', label: '3rd Place' },
  { id: 'final', label: 'Final' },
];

interface DraftTip {
  homeGoals: number | null;
  awayGoals: number | null;
  advanceTeamId: number | null;
}

function Flag({ code }: { code: string }) {
  if (!code) return null;
  return <span className={`fi fi-${code.toLowerCase()} playoff-ko-flag`} aria-hidden />;
}

function fmtKickoff(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** When the 90' result is decisive (not a draw), the advancing team is the winner. */
function decisiveWinnerId(m: KnockoutMatchView, d: DraftTip): number | null {
  if (d.homeGoals == null || d.awayGoals == null || d.homeGoals === d.awayGoals) return null;
  if (!m.homeTeam || !m.awayTeam) return null;
  return d.homeGoals > d.awayGoals ? m.homeTeam.id : m.awayTeam.id;
}

/** Advancing team the tip is saved with: the winner if the score is decisive, else the user's pick. */
function effectiveAdvanceId(m: KnockoutMatchView, d: DraftTip): number | null {
  return decisiveWinnerId(m, d) ?? d.advanceTeamId;
}

/** A match has started (or finished) once it's FINISHED or its kick-off has passed. */
function startedOrFinished(m: KnockoutMatchView, nowMs: number): boolean {
  if (m.status === 'FINISHED') return true;
  const t = new Date(m.kickOff).getTime();
  return !Number.isNaN(t) && t <= nowMs;
}

/**
 * Default round tab: advance past every round whose matches have all started or
 * finished, landing on the nearest round that still has upcoming matches.
 */
function computeDefaultRound(matches: KnockoutMatchView[], nowMs: number): KnockoutRoundName {
  let target: KnockoutRoundName = ROUND_ORDER[0].id;
  for (let i = 0; i < ROUND_ORDER.length; i++) {
    const id = ROUND_ORDER[i].id;
    const ms = matches.filter((m) => m.round === id);
    if (ms.length === 0) continue;
    const allStarted = ms.every((m) => startedOrFinished(m, nowMs));
    if (allStarted && i < ROUND_ORDER.length - 1) {
      target = ROUND_ORDER[i + 1].id; // previous round done → jump to next
    } else {
      target = id;
      break;
    }
  }
  return target;
}

export default function KnockoutTipEditor({ matches, userTips }: Props) {
  const tipByNum = useMemo(() => new Map(userTips.map((t) => [t.matchNumber, t])), [userTips]);

  const [drafts, setDrafts] = useState<Record<number, DraftTip>>(() => {
    const init: Record<number, DraftTip> = {};
    for (const m of matches) {
      const t = userTips.find((u) => u.matchNumber === m.matchNumber);
      init[m.matchNumber] = t
        ? { homeGoals: t.homeGoals, awayGoals: t.awayGoals, advanceTeamId: t.advanceTeamId }
        : { homeGoals: null, awayGoals: null, advanceTeamId: null };
    }
    return init;
  });

  const [activeRound, setActiveRound] = useState<KnockoutRoundName>(() => computeDefaultRound(matches, Date.now()));
  const [futureOnly, setFutureOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  // Snapshot of what is already persisted per match, so auto-save only sends
  // matches the user actually changed (and never re-sends on mount, which would
  // reset already-scored points to NULL).
  const lastSaved = useRef<Map<number, string>>(
    new Map(userTips.map((t) => [t.matchNumber, `${t.homeGoals}|${t.awayGoals}|${t.advanceTeamId}`])),
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recompute locks periodically so a card greys out as kick-off approaches.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-save: whenever drafts change, debounce and persist every match whose
  // tip is now consistent (full 90' score + a determined advancing team) and
  // differs from what's already saved. No manual save button.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const nowMs = Date.now();
      const payload: Array<{ matchNumber: number; homeGoals: number; awayGoals: number; advanceTeamId: number; key: string }> = [];
      for (const m of matches) {
        if (!m.participantsKnown) continue;
        if (isTipLocked(m.kickOff, m.status, nowMs)) continue;
        const d = drafts[m.matchNumber];
        if (!d || d.homeGoals == null || d.awayGoals == null) continue;
        const advanceTeamId = effectiveAdvanceId(m, d);
        if (advanceTeamId == null) continue; // not consistent yet
        const key = `${d.homeGoals}|${d.awayGoals}|${advanceTeamId}`;
        if (lastSaved.current.get(m.matchNumber) === key) continue; // unchanged
        payload.push({ matchNumber: m.matchNumber, homeGoals: d.homeGoals, awayGoals: d.awayGoals, advanceTeamId, key });
      }
      if (payload.length === 0) return;

      setAutoState('saving');
      setAutoMsg(null);
      fetch('/api/playoff/tips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tips: payload.map(({ key, ...t }) => { void key; return t; }) }),
      })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            setAutoState('error');
            setAutoMsg(data.error ?? 'Could not save');
            return;
          }
          const rej = new Set<number>(data.rejected ?? []);
          for (const p of payload) if (!rej.has(p.matchNumber)) lastSaved.current.set(p.matchNumber, p.key);
          setRejected(rej);
          setAutoState('saved');
          setAutoMsg(rej.size ? `${rej.size} match${rej.size > 1 ? 'es' : ''} were locked and skipped.` : null);
        })
        .catch(() => {
          setAutoState('error');
          setAutoMsg('Network error — your last change was not saved.');
        });
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [drafts, matches]);

  const byRound = useMemo(() => {
    const m = new Map<KnockoutRoundName, KnockoutMatchView[]>();
    for (const r of ROUND_ORDER) m.set(r.id, []);
    for (const match of matches) m.get(match.round)?.push(match);
    // Chronological within each round (by kick-off, then match number). Rounds
    // are already time-ordered, so the overall list runs first → last match.
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.kickOff || '').localeCompare(b.kickOff || '') || a.matchNumber - b.matchNumber);
    }
    return m;
  }, [matches]);

  function setDraft(num: number, patch: Partial<DraftTip>) {
    setDrafts((d) => ({ ...d, [num]: { ...d[num], ...patch } }));
  }

  // Entering a decisive 90' score fixes the advancing team to the winner, so the
  // pick can never contradict the score (e.g. 2–0 but "away advances").
  function handleScore(m: KnockoutMatchView, side: 'home' | 'away', v: number | null) {
    setDrafts((d) => {
      const cur = d[m.matchNumber];
      const next: DraftTip = { ...cur, [side === 'home' ? 'homeGoals' : 'awayGoals']: v };
      const winner = decisiveWinnerId(m, next);
      if (winner != null) {
        // Decisive 90' score fixes the advancing team to the winner.
        next.advanceTeamId = winner;
      } else if (next.homeGoals != null && next.awayGoals != null && next.homeGoals === next.awayGoals) {
        // Score is now a draw → the advancing pick is no longer implied by the
        // score; clear it so the user must consciously choose who goes through.
        next.advanceTeamId = null;
      }
      return { ...d, [m.matchNumber]: next };
    });
  }

  if (matches.length === 0) {
    return (
      <div className="alert alert-info">
        The knockout bracket isn&apos;t available yet. It appears once the group stage finishes.
      </div>
    );
  }

  return (
    <div className="playoff-bracket-tips">
      <div className="playoff-section-head">
        <h2 className="playoff-section-title">⚔️ Match predictions</h2>
        <p className="playoff-section-sub">
          For each match: predict the 90-minute score ({KO_EXACT_POINTS} pts if exact) and tap the team you think
          advances ({KO_ADVANCE_POINTS} pts). A match opens for tipping once both teams are known.
        </p>
      </div>

      <div className="playoff-bracket-controls">
        <nav className="ko-round-nav playoff-round-nav">
          {ROUND_ORDER.map(({ id, label }) => (
            <button
              key={id}
              className={`ko-round-nav-btn ${activeRound === id ? 'active' : ''}`}
              onClick={() => setActiveRound(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <label className="playoff-ios-toggle" title="Hide matches that have already been played">
          <input
            type="checkbox"
            checked={futureOnly}
            onChange={(e) => setFutureOnly(e.target.checked)}
          />
          <span className="playoff-ios-track"><span className="playoff-ios-thumb" /></span>
          <span className="playoff-ios-label">Future matches only</span>
        </label>
      </div>

      {(() => {
        const label = ROUND_ORDER.find((r) => r.id === activeRound)?.label ?? '';
        const all = byRound.get(activeRound) ?? [];
        // "Future matches only" hides matches that have already been played.
        const roundMatches = futureOnly ? all.filter((m) => m.status !== 'FINISHED') : all;
        return (
          <section className="playoff-round">
            <h3 className="playoff-round-title">{label}</h3>
            {roundMatches.length === 0 ? (
              <p className="playoff-round-empty">
                {all.length === 0
                  ? 'No matches in this round yet.'
                  : 'All matches in this round have been played — turn off “Future matches only” to review them.'}
              </p>
            ) : (
              <div className="playoff-match-list">
                {roundMatches.map((m) => (
                  <MatchCard
                    key={m.matchNumber}
                    match={m}
                    draft={drafts[m.matchNumber]}
                    savedTip={tipByNum.get(m.matchNumber) ?? null}
                    locked={isTipLocked(m.kickOff, m.status, now)}
                    wasRejected={rejected.has(m.matchNumber)}
                    onScore={(side, v) => handleScore(m, side, v)}
                    onAdvance={(teamId) => setDraft(m.matchNumber, { advanceTeamId: teamId })}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })()}

      <div className="playoff-save-bar">
        <span className="playoff-autosave" aria-live="polite">
          {autoState === 'saving' && '💾 Saving…'}
          {autoState === 'saved' && (autoMsg ? `⚠️ ${autoMsg}` : '✅ All changes saved automatically')}
          {autoState === 'error' && `⚠️ ${autoMsg ?? 'Could not save'}`}
          {autoState === 'idle' && 'Your predictions save automatically once a match is complete.'}
        </span>
      </div>
    </div>
  );
}

function TeamRow({
  team, placeholder, isAdvance, onPick, disabled,
}: {
  team: PlayoffTeam | null;
  placeholder: string;
  isAdvance: boolean;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className={`playoff-team-row ${isAdvance ? 'advance' : ''}`}
      onClick={onPick}
      disabled={disabled || !team}
      title={team ? `Pick ${team.name} to advance` : undefined}
    >
      {team ? <Flag code={team.countryCode} /> : null}
      <span className="playoff-team-name">{team ? team.name : placeholder}</span>
      {isAdvance && <span className="playoff-advance-badge">advances</span>}
    </button>
  );
}

function MatchCard({
  match, draft, savedTip, locked, wasRejected, onScore, onAdvance,
}: {
  match: KnockoutMatchView;
  draft: DraftTip;
  savedTip: UserKnockoutTip | null;
  locked: boolean;
  wasRejected: boolean;
  onScore: (side: 'home' | 'away', v: number | null) => void;
  onAdvance: (teamId: number) => void;
}) {
  const { homeTeam, awayTeam, participantsKnown, status } = match;
  const finished = status === 'FINISHED';
  const editable = participantsKnown && !locked && !finished;

  const scoreDone = draft.homeGoals != null && draft.awayGoals != null;
  const decisive = decisiveWinnerId(match, draft) != null;
  const winnerTeam = decisive ? (draft.homeGoals! > draft.awayGoals! ? homeTeam : awayTeam) : null;
  const advanceDone = draft.advanceTeamId != null;

  // Result line for finished matches.
  const resultBits: string[] = [];
  if (match.homeGoals != null && match.awayGoals != null) resultBits.push(`${match.homeGoals}–${match.awayGoals}`);
  if (match.homeGoalsEt != null && match.awayGoalsEt != null) resultBits.push(`AET ${match.homeGoalsEt}–${match.awayGoalsEt}`);
  if (match.homePens != null && match.awayPens != null) resultBits.push(`pens ${match.homePens}–${match.awayPens}`);
  // The team that actually advanced (shown bold on the result line).
  const advancedTeam = match.advancingTeamId == null ? null
    : match.advancingTeamId === homeTeam?.id ? homeTeam
    : match.advancingTeamId === awayTeam?.id ? awayTeam : null;

  return (
    <div className={`playoff-match-card ${finished ? 'finished' : ''} ${wasRejected ? 'rejected' : ''}`} data-match-number={match.matchNumber}>
     <div className="playoff-match-inner">
      <div className="playoff-match-meta">
        <span className="playoff-match-num">#{match.matchNumber}</span>
        {match.kickOff && <span className="playoff-match-time">{fmtKickoff(match.kickOff)}</span>}
        {locked && !finished && <span className="playoff-match-lock">🔒 Locked</span>}
        {finished && <span className="playoff-match-final">Full time</span>}
      </div>

      {match.venue && <div className="playoff-match-venue">📍 {match.venue}</div>}

      <div className="playoff-match-body">
        {editable ? (
          <>
            {/* 1) Enter the 90′ score first */}
            <div className="playoff-match-score">
              <span className="playoff-score-label">Your 90′ result</span>
              <div className="playoff-score-line">
                <span className="playoff-score-team">
                  {homeTeam && <Flag code={homeTeam.countryCode} />}
                  <span className="playoff-team-name">{homeTeam?.shortName}</span>
                </span>
                <ArrowStepper value={draft.homeGoals} onChange={(v) => onScore('home', v)} nullable max={20} />
                <span className="playoff-score-colon">:</span>
                <ArrowStepper value={draft.awayGoals} onChange={(v) => onScore('away', v)} nullable max={20} />
                <span className="playoff-score-team">
                  {awayTeam && <Flag code={awayTeam.countryCode} />}
                  <span className="playoff-team-name">{awayTeam?.shortName}</span>
                </span>
              </div>
            </div>

            {/* 2) Then who advances. Both teams always shown; a decisive 90'
                score highlights the winner and locks the choice (it can't
                contradict the score). A draw leaves it to the user. */}
            <div className="playoff-advance-pick">
              <span className="playoff-advance-pick-label">
                {decisive ? 'Advances (from your 90′ score)' : 'Who advances?'}
              </span>
              <div className="playoff-advance-choices">
                <TeamRow
                  team={homeTeam}
                  placeholder="—"
                  isAdvance={decisive ? winnerTeam?.id === homeTeam?.id : draft.advanceTeamId === homeTeam?.id}
                  onPick={() => homeTeam && onAdvance(homeTeam.id)}
                  disabled={decisive}
                />
                <TeamRow
                  team={awayTeam}
                  placeholder="—"
                  isAdvance={decisive ? winnerTeam?.id === awayTeam?.id : draft.advanceTeamId === awayTeam?.id}
                  onPick={() => awayTeam && onAdvance(awayTeam.id)}
                  disabled={decisive}
                />
              </div>
            </div>

            {/* 3) Completion summary — score first, then advancing */}
            <div className="playoff-match-status">
              <div className={`playoff-status-row ${scoreDone ? 'done' : 'todo'}`}>
                <span className="playoff-status-icon">{scoreDone ? '✅' : '⚠️'}</span>
                <span>{scoreDone ? '90′ score entered' : 'Enter the 90′ score'}</span>
              </div>
              <div className={`playoff-status-row ${advanceDone ? 'done' : 'todo'}`}>
                <span className="playoff-status-icon">{advanceDone ? '✅' : '⚠️'}</span>
                <span>{advanceDone ? 'Advancing team selected' : 'Pick who advances'}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="playoff-match-teams">
            <TeamRow
              team={homeTeam}
              placeholder="To be decided"
              isAdvance={draft.advanceTeamId != null ? draft.advanceTeamId === homeTeam?.id : false}
              onPick={() => {}}
              disabled
            />
            <TeamRow
              team={awayTeam}
              placeholder="To be decided"
              isAdvance={draft.advanceTeamId != null ? draft.advanceTeamId === awayTeam?.id : false}
              onPick={() => {}}
              disabled
            />
          </div>
        )}

        {!participantsKnown && (
          <div className="playoff-match-tbd">Opens once both teams are known.</div>
        )}
      </div>

      {/* Result first, then the user's tip; points as a badge spanning both. */}
      {(savedTip || finished) && (
        <div className="playoff-match-foot">
          <div className="playoff-foot-lines">
            {finished && resultBits.length > 0 && (
              <span className="playoff-foot-result">
                Result: {resultBits.join(' · ')}
                {advancedTeam && <> · <strong>{advancedTeam.name} advanced</strong></>}
              </span>
            )}
            {savedTip ? (
              <span className="playoff-foot-tip">
                Your tip: <strong>{savedTip.homeGoals}–{savedTip.awayGoals}</strong>
                {(homeTeam || awayTeam) && (() => {
                  const adv = savedTip.advanceTeamId === homeTeam?.id ? homeTeam : savedTip.advanceTeamId === awayTeam?.id ? awayTeam : null;
                  return adv ? <> · {adv.shortName} to advance</> : null;
                })()}
              </span>
            ) : finished ? (
              <span className="playoff-foot-tip playoff-foot-notip">You didn&apos;t tip this match.</span>
            ) : null}
          </div>
          {savedTip && savedTip.points != null ? (
            <span className={`playoff-foot-pts-badge ${savedTip.points === 0 ? 'zero' : savedTip.points < 10 ? 'low' : 'high'}`}>
              {savedTip.points > 0 ? `+${savedTip.points}` : '0'} pts
            </span>
          ) : finished && !savedTip ? (
            <span className="playoff-foot-pts-badge zero">0 pts</span>
          ) : null}
        </div>
      )}
     </div>
    </div>
  );
}
