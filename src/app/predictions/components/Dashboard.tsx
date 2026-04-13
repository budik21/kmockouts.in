'use client';

import { useState } from 'react';
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

  return (
    <div>
      {/* Score cards */}
      <div className="tipovacka-score-cards">
        <div className="tipovacka-score-card tipovacka-score-total">
          <div className="tipovacka-score-card-value">{stats.totalPoints}</div>
          <div className="tipovacka-score-card-label">Total Points</div>
        </div>
        <div className="tipovacka-score-card tipovacka-score-exact">
          <div className="tipovacka-score-card-value">{stats.exact}</div>
          <div className="tipovacka-score-card-label">Exact Score (+4)</div>
        </div>
        <div className="tipovacka-score-card tipovacka-score-outcome">
          <div className="tipovacka-score-card-value">{stats.outcome}</div>
          <div className="tipovacka-score-card-label">Correct Outcome (+1)</div>
        </div>
        <div className="tipovacka-score-card tipovacka-score-wrong">
          <div className="tipovacka-score-card-value">{stats.wrong}</div>
          <div className="tipovacka-score-card-label">Wrong (0)</div>
        </div>
      </div>

      {/* Compact progress + CTA */}
      <div className="tipovacka-progress-section mt-4">
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
          <button className="tipovacka-cta-btn" onClick={onGoToTips}>
            {allTipped ? 'Review your tips' : 'Add your tips'}
          </button>
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
          <div className="tipovacka-recent-tips">
            {scoredTips.map((match) => {
              const tip = tips[match.id];
              return (
                <div key={match.id} className="tipovacka-recent-tip-row">
                  <span className="tipovacka-recent-group">{match.groupId}</span>
                  <span className="tipovacka-recent-teams">
                    {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                  </span>
                  <span className="tipovacka-recent-tip">
                    {tip.homeGoals}:{tip.awayGoals}
                  </span>
                  <span className="tipovacka-recent-real">
                    ({match.homeGoals}:{match.awayGoals})
                  </span>
                  <span className={`tipovacka-pts tipovacka-pts-${tip.points}`}>
                    {tip.points === 4 ? '+4' : tip.points === 1 ? '+1' : '0'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
