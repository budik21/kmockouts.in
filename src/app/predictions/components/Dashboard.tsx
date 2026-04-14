'use client';

import { useState, useMemo } from 'react';
import type { TipMatch } from '../tips/page';

interface TipData {
  homeGoals: number;
  awayGoals: number;
  points: number | null;
}

interface Stats {
  exact: number;
  outcome: number;
  wrong: number;
  pending: number;
  total: number;
  totalPoints: number;
}

interface Props {
  stats: Stats;
  tips: Record<number, TipData>;
  matches: TipMatch[];
  tipsPublic: boolean;
  shareUrl: string;
  onTogglePublic: () => void;
  onGoToTips: () => void;
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
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch { return ''; }
}

function formatTime(kickOff: string): string {
  try {
    return new Date(kickOff).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

export default function Dashboard({ stats, tips, matches, tipsPublic, shareUrl, onTogglePublic, onGoToTips }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Recent scored tips
  const scoredTips = matches
    .filter((m) => tips[m.id]?.points !== null && tips[m.id]?.points !== undefined)
    .sort((a, b) => new Date(b.kickOff).getTime() - new Date(a.kickOff).getTime())
    .slice(0, 10);

  const totalTipped = Object.keys(tips).length;
  const totalMatches = matches.length;
  const progress = totalMatches > 0 ? Math.round((totalTipped / totalMatches) * 100) : 0;
  const allTipped = totalTipped >= totalMatches;

  // Hide CTA if all group-stage matches have already kicked off
  const allMatchesStarted = useMemo(() => {
    if (matches.length === 0) return true;
    const lastKickOff = Math.max(...matches.map((m) => new Date(m.kickOff).getTime()));
    return Date.now() > lastKickOff;
  }, [matches]);

  return (
    <div>
      {/* Score cards — qualify-widget pattern */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="tipovacka-stat-widget tipovacka-stat-total">
            <div className="tipovacka-stat-body">
              <span className="tipovacka-stat-value">{stats.totalPoints}</span>
            </div>
            <div className="tipovacka-stat-footer">Total Points</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="tipovacka-stat-widget tipovacka-stat-exact">
            <div className="tipovacka-stat-body">
              <span className="tipovacka-stat-value">{stats.exact}</span>
            </div>
            <div className="tipovacka-stat-footer">
              <span>Exact Score</span>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="tipovacka-stat-widget tipovacka-stat-outcome">
            <div className="tipovacka-stat-body">
              <span className="tipovacka-stat-value">{stats.outcome}</span>
            </div>
            <div className="tipovacka-stat-footer">
              <span>Correct Outcome</span>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="tipovacka-stat-widget tipovacka-stat-wrong">
            <div className="tipovacka-stat-body">
              <span className="tipovacka-stat-value">{stats.wrong}</span>
            </div>
            <div className="tipovacka-stat-footer">
              <span>Wrong</span>
            </div>
          </div>
        </div>
      </div>

      {/* Compact progress + CTA */}
      <div className="tipovacka-progress-section">
        <div className="d-flex align-items-center gap-3">
          <div className="flex-grow-1">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <strong style={{ fontSize: '0.85rem' }}>Predicted</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--wc-text-muted)' }}>{totalTipped}/{totalMatches}</span>
            </div>
            <div className="progress" style={{ height: '6px' }}>
              <div
                className="progress-bar"
                style={{ width: `${progress}%`, backgroundColor: 'var(--wc-accent)' }}
              />
            </div>
          </div>
          {!allMatchesStarted && (
            <button className="tipovacka-cta-btn" onClick={onGoToTips}>
              {allTipped ? 'Review your tips' : 'Add your tips'}
            </button>
          )}
        </div>
      </div>

      {/* Share settings */}
      <div className="tipovacka-share-section mt-4">
        <h5>Sharing</h5>
        <div className="d-flex align-items-center gap-3 mb-2">
          <label className="tipovacka-toggle">
            <input
              type="checkbox"
              checked={tipsPublic}
              onChange={onTogglePublic}
            />
            <span className="tipovacka-toggle-slider" />
          </label>
          <span>
            {tipsPublic ? 'Your predictions are public' : 'Your predictions are private'}
          </span>
        </div>
        {tipsPublic && (
          <div className="tipovacka-share-url">
            <input type="text" readOnly value={shareUrl} className="form-control form-control-sm" />
            <button className="btn btn-sm btn-outline-secondary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* Recent scored tips */}
      {scoredTips.length > 0 && (
        <div className="mt-4">
          <h5>Recent Scored Predictions</h5>
          <div className="tipovacka-matches-list">
            {scoredTips.map((match) => {
              const tip = tips[match.id];
              const hasScore = tip.points !== null;
              return (
                <div
                  key={match.id}
                  className={`tipovacka-match-row ${hasScore ? `scored scored-${tip.points}` : ''}`}
                >
                  <div className="tipovacka-match-header-row">
                    <span className="tipovacka-match-group">{match.groupId}</span>
                    <span className="tipovacka-match-team-labels">
                      <FlagIcon code={match.homeTeam.countryCode} />
                      <span className="tipovacka-team-full">{match.homeTeam.name}</span>
                      <span className="tipovacka-team-short">{match.homeTeam.shortName}</span>
                      <span className="tipovacka-match-vs">vs</span>
                      <span className="tipovacka-team-full">{match.awayTeam.name}</span>
                      <span className="tipovacka-team-short">{match.awayTeam.shortName}</span>
                      <FlagIcon code={match.awayTeam.countryCode} />
                    </span>
                  </div>
                  <div className="tipovacka-match-meta">
                    {match.venue && <span>{match.venue}</span>}
                    <span>{formatDate(match.kickOff)}, {formatTime(match.kickOff)}</span>
                  </div>
                  <div className="tipovacka-eval-strip">
                    <div className="tipovacka-eval-icon-cell">
                      {hasScore && (
                        <span className={`tipovacka-eval-icon tipovacka-eval-icon-${tip.points}`}>
                          {(tip.points === 4 || tip.points === 1) && (
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
                          )}
                          {tip.points === 0 && (
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="tipovacka-eval-cell">
                      <div className="tipovacka-eval-label">Prediction</div>
                      <div className="tipovacka-eval-value">{tip.homeGoals} : {tip.awayGoals}</div>
                    </div>
                    <div className="tipovacka-eval-cell">
                      <div className="tipovacka-eval-label">Result</div>
                      <div className="tipovacka-eval-value">{match.homeGoals} : {match.awayGoals}</div>
                    </div>
                    <div className="tipovacka-eval-cell tipovacka-eval-score-cell">
                      <div className="tipovacka-eval-label">Points</div>
                      <span className={`tipovacka-eval-badge tipovacka-eval-badge-${tip.points}`}>
                        {tip.points === 4 && '+4'}
                        {tip.points === 1 && '+1'}
                        {tip.points === 0 && '0'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
