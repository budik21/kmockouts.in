'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminMatch } from '../dashboard/page';
import type { PickemStatsRow } from '../dashboard/page';
import type { ScenarioMeta } from '@/app/worldcup2026/scenarios/page';
import MatchEditor from './MatchEditor';
import PickemActions from './PickemActions';
import UsersClient from '../users/UsersClient';
import FeatureFlagsClient from './FeatureFlagsClient';
import ScenarioPicker from '@/app/components/ScenarioPicker';
import type { FeatureFlag } from '@/lib/feature-flags';

interface DashboardTabsProps {
  initialMatches: AdminMatch[];
  pickemsStats: PickemStatsRow;
  isSuperadmin: boolean;
  adminEmails: string[];
  superadminEmail: string;
  scenarios: ScenarioMeta[];
  activeScenario: number | null;
  featureFlags: FeatureFlag[];
}

export default function DashboardTabs({
  initialMatches,
  pickemsStats,
  isSuperadmin,
  adminEmails,
  superadminEmail,
  scenarios,
  activeScenario,
  featureFlags,
}: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<'matches' | 'scenarios' | 'pickem' | 'users' | 'flags'>('matches');

  const tabButtonStyle = (isActive: boolean) => ({
    background: 'none',
    border: 'none',
    color: 'var(--wc-text)',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0.75rem 1.5rem 0.75rem 0',
    marginRight: '1.5rem',
    borderBottom: isActive ? '2px solid var(--wc-accent)' : '2px solid transparent',
    transition: 'border-color 0.2s',
  });

  const contentStyle = {
    paddingTop: '2rem',
  };

  const tabNavStyle: React.CSSProperties = {
    borderBottom: '1px solid var(--wc-border)',
    marginBottom: '0.5rem',
    overflowX: 'auto',
    overflowY: 'hidden',
    display: 'flex',
    whiteSpace: 'nowrap',
    scrollBehavior: 'smooth',
    WebkitOverflowScrolling: 'touch',
    position: 'relative',
  };

  return (
    <>
      <style>{`
        .admin-tabs-nav {
          scrollbar-width: thin;
          scrollbar-color: var(--wc-border) transparent;
        }
        .admin-tabs-nav::-webkit-scrollbar {
          height: 3px;
        }
        .admin-tabs-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .admin-tabs-nav::-webkit-scrollbar-thumb {
          background: var(--wc-border);
          border-radius: 2px;
        }
        @media (max-width: 768px) {
          .admin-tabs-nav {
            mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%);
            -webkit-mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%);
          }
        }
      `}</style>
      {/* Tab navigation - horizontally scrollable on mobile */}
      <div style={tabNavStyle} className="admin-tabs-nav">
        <button onClick={() => setActiveTab('matches')} style={tabButtonStyle(activeTab === 'matches')}>
          Match Results
        </button>
        <button onClick={() => setActiveTab('scenarios')} style={tabButtonStyle(activeTab === 'scenarios')}>
          Scenarios
        </button>
        <button onClick={() => setActiveTab('pickem')} style={tabButtonStyle(activeTab === 'pickem')}>
          Pick&apos;em
        </button>
        <button onClick={() => setActiveTab('users')} style={tabButtonStyle(activeTab === 'users')}>
          User Management
        </button>
        {isSuperadmin && (
          <button onClick={() => setActiveTab('flags')} style={tabButtonStyle(activeTab === 'flags')}>
            Feature Flags
          </button>
        )}
      </div>

      {/* Tab content */}
      <div style={contentStyle}>
        {/* Match Results tab */}
        {activeTab === 'matches' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1.5rem' }}>
              Match Results
            </h2>
            <MatchEditor initialMatches={initialMatches} isSuperadmin={isSuperadmin} />
          </div>
        )}

        {/* Scenarios tab */}
        {activeTab === 'scenarios' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Test Scenarios
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Select a match data scenario to explore the tournament at different stages. Switching scenarios
              updates all results, recalculates probabilities, and regenerates AI commentary.
            </p>
            <ScenarioPicker scenarios={scenarios} active={activeScenario} requireConfirm />
          </div>
        )}

        {/* Pick'em tab */}
        {activeTab === 'pickem' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1.5rem' }}>
              Pick&apos;em Management
            </h2>

            {/* Stats widget */}
            <div
              className="p-3 rounded mb-4"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--wc-border)',
              }}
            >
              <div className="d-flex align-items-baseline justify-content-between mb-2">
                <h3 style={{ color: 'var(--wc-text)', fontSize: '1.05rem', margin: 0 }}>
                  Current tipsters
                </h3>
                <Link href="/pickem/leaderboard" style={{ fontSize: '0.85rem' }}>
                  View public leaderboard →
                </Link>
              </div>
              <div className="row g-3">
                <div className="col-4">
                  <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Total</div>
                  <div style={{ color: 'var(--wc-text)', fontSize: '1.6rem', fontWeight: 600 }}>
                    {pickemsStats.total}
                  </div>
                </div>
                <div className="col-4">
                  <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>With consent</div>
                  <div style={{ color: 'var(--wc-accent)', fontSize: '1.6rem', fontWeight: 600 }}>
                    {pickemsStats.with_consent}
                  </div>
                </div>
                <div className="col-4">
                  <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Without consent</div>
                  <div style={{ color: 'var(--wc-text)', fontSize: '1.6rem', fontWeight: 600, opacity: 0.6 }}>
                    {pickemsStats.without_consent}
                  </div>
                </div>
              </div>
            </div>

            {/* Management Actions */}
            <PickemActions isSuperadmin={isSuperadmin} />
          </div>
        )}

        {/* User Management tab */}
        {activeTab === 'users' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1.5rem' }}>
              Administrator Management
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Users whose Google e-mail matches any of these addresses will be granted admin access after signing in.
            </p>
            <UsersClient initialEmails={adminEmails} superadmin={superadminEmail} />
          </div>
        )}

        {/* Feature Flags tab — superadmin only */}
        {activeTab === 'flags' && isSuperadmin && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Feature Flags
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Runtime switches for opt-in features. Changes take effect within ~30&nbsp;seconds across the app.
            </p>
            <FeatureFlagsClient initialFlags={featureFlags} isSuperadmin={isSuperadmin} />
          </div>
        )}
      </div>
    </>
  );
}
