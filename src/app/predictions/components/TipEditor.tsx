'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TipMatch } from '../tips/page';
import ArrowStepper from '@/app/components/ArrowStepper';

interface TipData {
  homeGoals: number;
  awayGoals: number;
  points: number | null;
}

interface Props {
  matches: TipMatch[];
  tips: Record<number, TipData>;
  onTipUpdate: (matchId: number, homeGoals: number, awayGoals: number) => void;
  allGroups: string[];
}

function FlagIcon({ code }: { code: string }) {
  if (!code) return <span>?</span>;
  const cls = code.length > 2
    ? `fi fi-${code.slice(0, 2).toLowerCase()} fis fi-${code.toLowerCase()}`
    : `fi fi-${code.toLowerCase()}`;
  return <span className={`${cls} flag-sm`} />;
}

function formatDate(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch { return ''; }
}

function formatTime(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return ''; }
}

export default function TipEditor({ matches, tips, onTipUpdate, allGroups }: Props) {
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  const filteredMatches = useMemo(() => {
    if (groupFilter === 'ALL') return matches;
    return matches.filter((m) => m.groupId === groupFilter);
  }, [matches, groupFilter]);

  // Group by date
  const matchesByDate = useMemo(() => {
    const map = new Map<string, TipMatch[]>();
    for (const m of filteredMatches) {
      const date = formatDate(m.kickOff);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(m);
    }
    return map;
  }, [filteredMatches]);

  const handleSave = useCallback(async (matchId: number) => {
    const tip = tips[matchId];
    if (!tip) return;

    setSaving((prev) => ({ ...prev, [matchId]: true }));
    try {
      const res = await fetch('/api/tips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tips: [{ matchId, homeGoals: tip.homeGoals, awayGoals: tip.awayGoals }],
        }),
      });
      if (res.ok) {
        setSaved((prev) => ({ ...prev, [matchId]: true }));
        setTimeout(() => setSaved((prev) => ({ ...prev, [matchId]: false })), 2000);
      }
    } finally {
      setSaving((prev) => ({ ...prev, [matchId]: false }));
    }
  }, [tips]);

  const isMatchLocked = (m: TipMatch) => {
    return m.status !== 'SCHEDULED' || new Date(m.kickOff) <= new Date();
  };

  return (
    <div>
      {/* Group filters */}
      <div className="tipovacka-group-filters mb-3">
        <button
          className={`tipovacka-filter-btn ${groupFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => setGroupFilter('ALL')}
        >
          All
        </button>
        {allGroups.map((g) => (
          <button
            key={g}
            className={`tipovacka-filter-btn ${groupFilter === g ? 'active' : ''}`}
            onClick={() => setGroupFilter(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Matches */}
      {Array.from(matchesByDate.entries()).map(([date, dateMatches]) => (
        <div key={date} className="mb-4">
          <h6 className="tipovacka-date-header">{date}</h6>
          <div className="tipovacka-matches-list">
            {dateMatches.map((match) => {
              const locked = isMatchLocked(match);
              const tip = tips[match.id];
              const homeGoals = tip?.homeGoals ?? 0;
              const awayGoals = tip?.awayGoals ?? 0;
              const hasTip = !!tip;
              const isSaving = saving[match.id];
              const isSaved = saved[match.id];
              const isFinished = match.status === 'FINISHED' && match.homeGoals !== null;
              const hasScore = hasTip && tip.points !== null;

              return (
                <div
                  key={match.id}
                  className={`tipovacka-match-row ${locked ? 'locked' : ''} ${hasTip ? 'has-tip' : 'no-tip'} ${hasScore ? `scored scored-${tip.points}` : ''}`}
                >
                  {/* Header: group + teams + time */}
                  <div className="tipovacka-match-header-row">
                    <span className="tipovacka-match-group">{match.groupId}</span>
                    <span className="tipovacka-match-team-labels">
                      <FlagIcon code={match.homeTeam.countryCode} />
                      <span>{match.homeTeam.shortName}</span>
                      <span className="tipovacka-match-vs">vs</span>
                      <span>{match.awayTeam.shortName}</span>
                      <FlagIcon code={match.awayTeam.countryCode} />
                    </span>
                    <span className="tipovacka-match-time">{formatTime(match.kickOff)}</span>
                  </div>

                  {/* Editable match — not locked yet */}
                  {!locked && (
                    <div className="tipovacka-edit-row">
                      <div className="tipovacka-edit-scores">
                        <ArrowStepper
                          value={homeGoals}
                          onChange={(v) => onTipUpdate(match.id, v ?? 0, awayGoals)}
                          min={0}
                          max={15}
                        />
                        <span className="tipovacka-score-separator">:</span>
                        <ArrowStepper
                          value={awayGoals}
                          onChange={(v) => onTipUpdate(match.id, homeGoals, v ?? 0)}
                          min={0}
                          max={15}
                        />
                      </div>
                      <button
                        className={`tipovacka-save-btn ${isSaved ? 'saved' : ''}`}
                        onClick={() => handleSave(match.id)}
                        disabled={isSaving}
                      >
                        {isSaving ? '...' : isSaved ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  )}

                  {/* Locked match with evaluation — 3-column strip */}
                  {locked && (isFinished || hasTip) && (
                    <div className="tipovacka-eval-strip">
                      {/* Prediction */}
                      <div className="tipovacka-eval-cell">
                        <div className="tipovacka-eval-label">Prediction</div>
                        <div className="tipovacka-eval-value">
                          {hasTip ? `${tip.homeGoals} : ${tip.awayGoals}` : '—'}
                        </div>
                      </div>

                      {/* Actual result */}
                      <div className="tipovacka-eval-cell">
                        <div className="tipovacka-eval-label">Result</div>
                        <div className="tipovacka-eval-value">
                          {isFinished ? `${match.homeGoals} : ${match.awayGoals}` : '—'}
                        </div>
                      </div>

                      {/* Score indicator */}
                      <div className="tipovacka-eval-cell tipovacka-eval-score-cell">
                        {hasScore ? (
                          <>
                            <div className="tipovacka-eval-label">Points</div>
                            <div className={`tipovacka-eval-badge tipovacka-eval-badge-${tip.points}`}>
                              {tip.points === 4 && <><span className="tipovacka-eval-emoji">&#127919;</span> +4</>}
                              {tip.points === 1 && <><span className="tipovacka-eval-emoji">&#128077;</span> +1</>}
                              {tip.points === 0 && <><span className="tipovacka-eval-emoji">&#10060;</span> 0</>}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="tipovacka-eval-label">Points</div>
                            <div className="tipovacka-eval-value tipovacka-eval-pending">
                              {hasTip ? 'Pending' : '—'}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Locked, no tip, not finished — just show dash */}
                  {locked && !isFinished && !hasTip && (
                    <div className="tipovacka-eval-strip">
                      <div className="tipovacka-eval-cell" style={{ flex: 1 }}>
                        <div className="tipovacka-eval-value" style={{ color: 'var(--wc-text-muted)' }}>No prediction</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
