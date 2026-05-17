'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { signOut } from 'next-auth/react';
import type { TipMatch } from '../tips/page';
import TipEditor from './TipEditor';
import GroupComparison from './GroupComparison';
import LeaguesView, { type LeagueListItem } from '../leagues/LeaguesView';
import SettingsTab from './SettingsTab';

type Tab = 'predictions' | 'groups' | 'leagues' | 'settings';

interface NotifyPrefs {
  exactScore: boolean;
  winnerOnly: boolean;
  wrongTip: boolean;
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
  const [tab, setTab] = useState<Tab>(initialTab ?? 'predictions');
  const [tips, setTips] = useState<Record<number, TipData>>({});
  const [loading, setLoading] = useState(true);
  const [tipsPublic, setTipsPublic] = useState(initialPublic);

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

  const flushDirtyCount = () => setDirtyCount(dirtyMatches.current.size);

  const saveTip = useCallback(async (matchId: number, homeGoals: number, awayGoals: number) => {
    try {
      await fetch('/api/tips/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tips: [{ matchId, homeGoals, awayGoals }] }),
      });
    } finally {
      saveTimers.current.delete(matchId);
      dirtyMatches.current.delete(matchId);
      flushDirtyCount();
    }
  }, []);

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
    return () => {
      timers.forEach((t) => clearTimeout(t));
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
            <div className="d-flex align-items-center gap-2">
              <span className="tipovacka-points-badge">
                {stats.totalPoints} pts
              </span>
              <button
                className="btn btn-sm btn-outline-light"
                onClick={() => signOut({ callbackUrl: '/pickem' })}
              >
                Sign out
              </button>
            </div>
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
              className={`tipovacka-tab ${tab === 'groups' ? 'active' : ''}`}
              onClick={() => setTab('groups')}
            >
              Groups
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
                  <div className="tipovacka-score-card-value">{totalMatches}</div>
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
                <div className="progress" style={{ height: '6px' }}>
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%`, backgroundColor: 'var(--wc-accent)' }}
                  />
                </div>
              </div>
            </div>

            <TipEditor
              matches={matches}
              tips={tips}
              onTipUpdate={handleTipUpdate}
              allGroups={allGroups}
            />
          </>
        )}

        {tab === 'groups' && (
          <GroupComparison
            matches={matches}
            tips={tips}
            allGroups={allGroups}
          />
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
