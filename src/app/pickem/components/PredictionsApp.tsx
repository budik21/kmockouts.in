'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { TipMatch } from '../tips/page';
import TipEditor from './TipEditor';
import LeaguesView, { type LeagueListItem } from '../leagues/LeaguesView';
import SettingsTab from './SettingsTab';

type Tab = 'predictions' | 'leagues' | 'settings';

interface NotifyPrefs {
  exactScore: boolean;
  winnerOnly: boolean;
  wrongTip: boolean;
  playoff: boolean;
}

interface TipData {
  homeGoals: number;
  awayGoals: number;
  points: number | null;
}

interface Props {
  matches: TipMatch[];
  userName: string;
  shareToken: string;
  tipsPublic: boolean;
  myLeagues: LeagueListItem[];
  participatingLeagues: LeagueListItem[];
  isAdmin: boolean;
  initialTab?: Tab;
  initialNotify: NotifyPrefs;
}

export default function PredictionsApp({
  matches,
  userName,
  shareToken,
  tipsPublic: initialPublic,
  myLeagues,
  participatingLeagues,
  isAdmin,
  initialTab,
  initialNotify,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'predictions');
  const [tips, setTips] = useState<Record<number, TipData>>({});
  const [loading, setLoading] = useState(true);
  const [tipsPublic, setTipsPublic] = useState(initialPublic);

  const hasLeagues = myLeagues.length > 0 || participatingLeagues.length > 0;
  const leaderboardLabel = !tipsPublic && hasLeagues ? 'Show Leaderboards' : 'Show Leaderboard';
  const showLeaderboardCaption = tipsPublic && hasLeagues;
  const handleShowLeaderboard = useCallback(() => {
    if (!tipsPublic && hasLeagues) {
      setTab('leagues');
    } else {
      router.push('/pickem/leaderboard');
    }
  }, [tipsPublic, hasLeagues, router]);

  // Load user tips
  useEffect(() => {
    fetch('/api/tips/my')
      .then((r) => r.json())
      .then((data) => {
        if (data.tips) setTips(data.tips);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const dirtyMatches = useRef<Set<number>>(new Set());
  const [dirtyCount, setDirtyCount] = useState(0);
  // Matches whose last save was rejected because the match had already locked.
  // Each error auto-clears after a few seconds (timers tracked for cleanup).
  const [saveErrors, setSaveErrors] = useState<Set<number>>(new Set());
  const errorTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const showSaveError = useCallback((matchId: number) => {
    setSaveErrors((prev) => new Set(prev).add(matchId));
    const existing = errorTimers.current.get(matchId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setSaveErrors((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
      errorTimers.current.delete(matchId);
    }, 5000);
    errorTimers.current.set(matchId, timer);
  }, []);

  const flushDirtyCount = () => setDirtyCount(dirtyMatches.current.size);

  // Pull a single match's tip back from the server so a rejected (locked) save
  // doesn't leave the locked strip showing an unsaved prediction.
  const resyncTip = useCallback(async (matchId: number) => {
    try {
      const data = await fetch('/api/tips/my').then((r) => r.json());
      setTips((prev) => {
        const next = { ...prev };
        const fresh = data?.tips?.[matchId];
        if (fresh) next[matchId] = fresh;
        else delete next[matchId];
        return next;
      });
    } catch {
      /* leave local state as-is; the error message still informs the user */
    }
  }, []);

  const saveTip = useCallback(async (matchId: number, homeGoals: number, awayGoals: number) => {
    try {
      const res = await fetch('/api/tips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tips: [{ matchId, homeGoals, awayGoals }] }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && Array.isArray(data.rejected) && data.rejected.includes(matchId)) {
          showSaveError(matchId);
          await resyncTip(matchId);
        }
      }
    } finally {
      saveTimers.current.delete(matchId);
      dirtyMatches.current.delete(matchId);
      flushDirtyCount();
    }
  }, [resyncTip, showSaveError]);

  const handleTipUpdate = useCallback((matchId: number, homeGoals: number, awayGoals: number) => {
    setTips((prev) => ({
      ...prev,
      [matchId]: { homeGoals, awayGoals, points: prev[matchId]?.points ?? null },
    }));
    dirtyMatches.current.add(matchId);
    flushDirtyCount();
    const existing = saveTimers.current.get(matchId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => saveTip(matchId, homeGoals, awayGoals), 1000);
    saveTimers.current.set(matchId, timer);
  }, [saveTip]);

  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  useEffect(() => {
    const timers = saveTimers.current;
    const errTimers = errorTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      errTimers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleTogglePublic = useCallback(async () => {
    const newVal = !tipsPublic;
    setTipsPublic(newVal);
    await fetch('/api/tips/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipsPublic: newVal }),
    });
  }, [tipsPublic]);

  // Untipped-only filter lives next to the Predicted widget; snapshot is
  // frozen the moment the toggle flips on so saving a tip doesn't make a
  // row vanish under the user.
  const [untippedOnly, setUntippedOnly] = useState(false);
  const [untippedSnapshot, setUntippedSnapshot] = useState<Set<number> | null>(null);
  const handleUntippedToggle = useCallback(() => {
    setUntippedOnly((prev) => {
      const next = !prev;
      if (next) {
        const ids = new Set(matches.filter((m) => !tips[m.id]).map((m) => m.id));
        setUntippedSnapshot(ids);
      } else {
        setUntippedSnapshot(null);
      }
      return next;
    });
  }, [matches, tips]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/pickem/share/${shareToken}`;
  }, [shareToken]);

  const allGroups = useMemo(() => {
    const groups = new Set(matches.map((m) => m.groupId));
    return Array.from(groups).sort();
  }, [matches]);

  // Scoring stats
  const stats = useMemo(() => {
    let exact = 0, outcome = 0, wrong = 0, pending = 0, total = 0;
    for (const matchId of Object.keys(tips)) {
      const tip = tips[Number(matchId)];
      total++;
      if (tip.points === null) { pending++; continue; }
      if (tip.points === 4) exact++;
      else if (tip.points === 1) outcome++;
      else wrong++;
    }
    return {
      exact,
      outcome,
      wrong,
      pending,
      total,
      totalPoints: exact * 4 + outcome * 1,
    };
  }, [tips]);

  const totalTipped = Object.keys(tips).length;
  const totalMatches = matches.length;
  const progress = totalMatches > 0 ? Math.round((totalTipped / totalMatches) * 100) : 0;
  const tipsColor =
    totalTipped === 0
      ? '#dc2626'
      : totalTipped >= totalMatches
        ? '#15803d'
        : 'darkgoldenrod';
  const scored = stats.exact + stats.outcome + stats.wrong;
  const pct = (n: number) => (scored > 0 ? Math.round((n / scored) * 100) : 0);

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-secondary" />
      </div>
    );
  }

  return (
    <div className="tipovacka-app">
      {/* Header */}
      <div className="tipovacka-app-header">
        <div className="container">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h1 className="tipovacka-app-title">WC 2026 Predictions</h1>
              <p className="tipovacka-app-user mb-0">
                {userName}
              </p>
            </div>
            {(tipsPublic || hasLeagues) && (
              <div className="d-flex flex-column align-items-end">
                <button
                  className="tipovacka-leaderboard-btn"
                  onClick={handleShowLeaderboard}
                >
                  {leaderboardLabel}
                </button>
                {showLeaderboardCaption && (
                  <small
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--wc-text-muted)',
                      marginTop: '0.2rem',
                      lineHeight: 1.2,
                    }}
                  >
                    For other leaderboards see League tab
                  </small>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tipovacka-tabs">
        <div className="container">
          <div className="d-flex gap-1">
            <button
              className={`tipovacka-tab ${tab === 'predictions' ? 'active' : ''}`}
              onClick={() => setTab('predictions')}
            >
              Your tips
            </button>
            <button
              className={`tipovacka-tab ${tab === 'leagues' ? 'active' : ''}`}
              onClick={() => setTab('leagues')}
            >
              Leagues
            </button>
            <button
              className={`tipovacka-tab ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-3">
        {tab === 'predictions' && (
          <>
            <div className="tipovacka-dashboard-row mb-4">
              <div className="tipovacka-score-cards tipovacka-score-cards-wide">
                <div className="tipovacka-score-card tipovacka-score-matches">
                  <div className="tipovacka-score-card-value" style={{ color: tipsColor }}>
                    {totalTipped}/{totalMatches}
                  </div>
                  <div className="tipovacka-score-card-label">Tips Total</div>
                </div>
                <div className="tipovacka-score-card tipovacka-score-exact">
                  <div className="tipovacka-score-card-value">{stats.exact}</div>
                  <div className="tipovacka-score-card-pct">{pct(stats.exact)}%</div>
                  <div className="tipovacka-score-card-label">Exact Score Match</div>
                </div>
                <div className="tipovacka-score-card tipovacka-score-outcome">
                  <div className="tipovacka-score-card-value">{stats.outcome}</div>
                  <div className="tipovacka-score-card-pct">{pct(stats.outcome)}%</div>
                  <div className="tipovacka-score-card-label">Winner Match</div>
                </div>
                <div className="tipovacka-score-card tipovacka-score-wrong">
                  <div className="tipovacka-score-card-value">{stats.wrong}</div>
                  <div className="tipovacka-score-card-pct">{pct(stats.wrong)}%</div>
                  <div className="tipovacka-score-card-label">Bad Tips</div>
                </div>
                <div className="tipovacka-score-card tipovacka-score-points">
                  <div className="tipovacka-score-card-value">{stats.totalPoints}</div>
                  <div className="tipovacka-score-card-label">Points</div>
                </div>
              </div>

              <div className="tipovacka-progress-section tipovacka-dashboard-row-item">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <strong style={{ fontSize: '0.85rem' }}>Predicted</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--wc-text-muted)' }}>
                    {totalTipped}/{totalMatches}
                  </span>
                </div>
                <div className="progress mb-2" style={{ height: '6px' }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%`, backgroundColor: 'var(--wc-accent)' }}
                  />
                </div>
                <label className="tipovacka-untipped-toggle">
                  <span className="tipovacka-toggle tipovacka-toggle-sm">
                    <input
                      type="checkbox"
                      checked={untippedOnly}
                      onChange={handleUntippedToggle}
                    />
                    <span className="tipovacka-toggle-slider" />
                  </span>
                  <span className="tipovacka-untipped-label">Show untipped only</span>
                </label>
              </div>
            </div>

            <TipEditor
              matches={matches}
              tips={tips}
              onTipUpdate={handleTipUpdate}
              allGroups={allGroups}
              shareToken={shareToken}
              untippedOnly={untippedOnly}
              untippedSnapshot={untippedSnapshot}
              saveErrors={saveErrors}
            />
          </>
        )}

        {tab === 'leagues' && (
          <LeaguesView
            myLeagues={myLeagues}
            participating={participatingLeagues}
            isAdmin={isAdmin}
          />
        )}

        {tab === 'settings' && (
          <SettingsTab
            initialNotify={initialNotify}
            tipsPublic={tipsPublic}
            shareUrl={shareUrl}
            onTogglePublic={handleTogglePublic}
          />
        )}
      </div>
    </div>
  );
}
