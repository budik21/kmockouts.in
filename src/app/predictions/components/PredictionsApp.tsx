'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { signOut } from 'next-auth/react';
import type { TipMatch } from '../tips/page';
import TipEditor from './TipEditor';
import Dashboard from './Dashboard';
import GroupComparison from './GroupComparison';

type Tab = 'predictions' | 'dashboard' | 'groups';

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
}

export default function PredictionsApp({ matches, userName, shareToken, tipsPublic: initialPublic }: Props) {
  const [tab, setTab] = useState<Tab>('predictions');
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

  const handleTipUpdate = useCallback((matchId: number, homeGoals: number, awayGoals: number) => {
    setTips((prev) => ({
      ...prev,
      [matchId]: { homeGoals, awayGoals, points: prev[matchId]?.points ?? null },
    }));
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
    return `${window.location.origin}/predictions/share/${shareToken}`;
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
                onClick={() => signOut({ callbackUrl: '/predictions' })}
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
              Predictions
            </button>
            <button
              className={`tipovacka-tab ${tab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`tipovacka-tab ${tab === 'groups' ? 'active' : ''}`}
              onClick={() => setTab('groups')}
            >
              Groups
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-3">
        {tab === 'predictions' && (
          <TipEditor
            matches={matches}
            tips={tips}
            onTipUpdate={handleTipUpdate}
            allGroups={allGroups}
          />
        )}

        {tab === 'dashboard' && (
          <Dashboard
            stats={stats}
            tips={tips}
            matches={matches}
            tipsPublic={tipsPublic}
            shareUrl={shareUrl}
            onTogglePublic={handleTogglePublic}
          />
        )}

        {tab === 'groups' && (
          <GroupComparison
            matches={matches}
            tips={tips}
            allGroups={allGroups}
          />
        )}
      </div>
    </div>
  );
}
