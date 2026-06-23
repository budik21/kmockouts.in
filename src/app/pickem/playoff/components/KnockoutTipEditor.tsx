'use client';

import { useEffect, useMemo, useState } from 'react';
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

  const [activeRound, setActiveRound] = useState<KnockoutRoundName>('r32');
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  // Recompute locks periodically so a card greys out as kick-off approaches.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const byRound = useMemo(() => {
    const m = new Map<KnockoutRoundName, KnockoutMatchView[]>();
    for (const r of ROUND_ORDER) m.set(r.id, []);
    for (const match of matches) m.get(match.round)?.push(match);
    return m;
  }, [matches]);

  function setDraft(num: number, patch: Partial<DraftTip>) {
    setDrafts((d) => ({ ...d, [num]: { ...d[num], ...patch } }));
    setMessage(null);
  }

  function isComplete(d: DraftTip): boolean {
    return d.homeGoals != null && d.awayGoals != null && d.advanceTeamId != null;
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    const payload: Array<{ matchNumber: number; homeGoals: number; awayGoals: number; advanceTeamId: number }> = [];
    for (const m of matches) {
      const d = drafts[m.matchNumber];
      if (!m.participantsKnown) continue;
      if (isTipLocked(m.kickOff, m.status, now)) continue;
      if (!isComplete(d)) continue;
      payload.push({
        matchNumber: m.matchNumber,
        homeGoals: d.homeGoals!,
        awayGoals: d.awayGoals!,
        advanceTeamId: d.advanceTeamId!,
      });
    }
    if (payload.length === 0) {
      setSaving(false);
      setMessage({ kind: 'err', text: 'Nothing to save — complete at least one open match (score + who advances).' });
      return;
    }
    try {
      const res = await fetch('/api/playoff/tips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tips: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error ?? 'Could not save your tips' });
      } else {
        setRejected(new Set<number>(data.rejected ?? []));
        const rej = (data.rejected ?? []).length;
        setMessage({
          kind: rej ? 'err' : 'ok',
          text: rej
            ? `Saved ${data.saved}. ${rej} match${rej > 1 ? 'es' : ''} were locked and skipped.`
            : `Saved ${data.saved} prediction${data.saved === 1 ? '' : 's'}.`,
        });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Network error — please try again.' });
    } finally {
      setSaving(false);
    }
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
        <h2 className="playoff-section-title">⚔️ Bracket predictions</h2>
        <p className="playoff-section-sub">
          For each match: predict the 90-minute score ({KO_EXACT_POINTS} pts if exact) and tap the team you think
          advances ({KO_ADVANCE_POINTS} pts). A match opens for tipping once both teams are known.
        </p>
      </div>

      <nav className="ko-round-nav playoff-round-nav">
        {ROUND_ORDER.map(({ id, label }) => (
          <button
            key={id}
            className={`ko-round-nav-btn ${activeRound === id ? 'active' : ''}`}
            onClick={() => {
              setActiveRound(id);
              document.getElementById(`playoff-round-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {ROUND_ORDER.map(({ id, label }) => {
        const roundMatches = byRound.get(id) ?? [];
        if (roundMatches.length === 0) return null;
        return (
          <section key={id} id={`playoff-round-${id}`} className="playoff-round">
            <h3 className="playoff-round-title">{label}</h3>
            <div className="playoff-match-list">
              {roundMatches.map((m) => (
                <MatchCard
                  key={m.matchNumber}
                  match={m}
                  draft={drafts[m.matchNumber]}
                  savedTip={tipByNum.get(m.matchNumber) ?? null}
                  locked={isTipLocked(m.kickOff, m.status, now)}
                  wasRejected={rejected.has(m.matchNumber)}
                  onScore={(side, v) => setDraft(m.matchNumber, side === 'home' ? { homeGoals: v } : { awayGoals: v })}
                  onAdvance={(teamId) => setDraft(m.matchNumber, { advanceTeamId: teamId })}
                />
              ))}
            </div>
          </section>
        );
      })}

      <div className="playoff-save-bar">
        <button className="tipovacka-btn tipovacka-btn-primary" disabled={saving} onClick={saveAll}>
          {saving ? 'Saving…' : 'Save predictions'}
        </button>
        {message && (
          <span className={message.kind === 'ok' ? 'playoff-save-ok' : 'playoff-save-err'}>{message.text}</span>
        )}
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

  // Result line for finished matches.
  const resultBits: string[] = [];
  if (match.homeGoals != null && match.awayGoals != null) resultBits.push(`${match.homeGoals}–${match.awayGoals}`);
  if (match.homeGoalsEt != null && match.awayGoalsEt != null) resultBits.push(`AET ${match.homeGoalsEt}–${match.awayGoalsEt}`);
  if (match.homePens != null && match.awayPens != null) resultBits.push(`pens ${match.homePens}–${match.awayPens}`);

  return (
    <div className={`playoff-match-card ${finished ? 'finished' : ''} ${wasRejected ? 'rejected' : ''}`} data-match-number={match.matchNumber}>
      <div className="playoff-match-meta">
        <span className="playoff-match-num">#{match.matchNumber}</span>
        {match.kickOff && <span className="playoff-match-time">{fmtKickoff(match.kickOff)}</span>}
        {locked && !finished && <span className="playoff-match-lock">🔒 Locked</span>}
        {finished && <span className="playoff-match-final">Full time</span>}
      </div>

      <div className="playoff-match-body">
        <div className="playoff-match-teams">
          <TeamRow
            team={homeTeam}
            placeholder="To be decided"
            isAdvance={draft.advanceTeamId != null ? draft.advanceTeamId === homeTeam?.id : false}
            onPick={() => homeTeam && onAdvance(homeTeam.id)}
            disabled={!editable}
          />
          <TeamRow
            team={awayTeam}
            placeholder="To be decided"
            isAdvance={draft.advanceTeamId != null ? draft.advanceTeamId === awayTeam?.id : false}
            onPick={() => awayTeam && onAdvance(awayTeam.id)}
            disabled={!editable}
          />
        </div>

        {editable && (
          <div className="playoff-match-score">
            <span className="playoff-score-label">Your 90′ score</span>
            <div className="playoff-score-steppers">
              <ArrowStepper value={draft.homeGoals} onChange={(v) => onScore('home', v)} nullable max={20} />
              <span className="playoff-score-colon">:</span>
              <ArrowStepper value={draft.awayGoals} onChange={(v) => onScore('away', v)} nullable max={20} />
            </div>
          </div>
        )}

        {!participantsKnown && (
          <div className="playoff-match-tbd">Opens once both teams are known.</div>
        )}
      </div>

      {/* Your saved tip + result */}
      {(savedTip || finished) && (
        <div className="playoff-match-foot">
          {savedTip && (
            <span className="playoff-foot-tip">
              Your tip: <strong>{savedTip.homeGoals}–{savedTip.awayGoals}</strong>
              {(homeTeam || awayTeam) && (() => {
                const adv = savedTip.advanceTeamId === homeTeam?.id ? homeTeam : savedTip.advanceTeamId === awayTeam?.id ? awayTeam : null;
                return adv ? <> · {adv.shortName} to advance</> : null;
              })()}
              {savedTip.points != null && (
                <span className={`playoff-foot-pts ${savedTip.points > 0 ? 'hit' : 'miss'}`}>
                  {savedTip.points > 0 ? `+${savedTip.points} pts` : '0 pts'}
                </span>
              )}
            </span>
          )}
          {finished && resultBits.length > 0 && (
            <span className="playoff-foot-result">Result: {resultBits.join(' · ')}</span>
          )}
        </div>
      )}
    </div>
  );
}
