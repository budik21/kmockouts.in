'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminMatch } from '../dashboard/page';
import type { PickemStatsRow } from '../dashboard/page';
import MatchEditor from './MatchEditor';
import PickemActions from './PickemActions';
import UsersClient from '../users/UsersClient';

interface DashboardTabsProps {
  initialMatches: AdminMatch[];
  pickemsStats: PickemStatsRow;
  isSuperadmin: boolean;
  adminEmails: string[];
  superadminEmail: string;
}

export default function DashboardTabs({
  initialMatches,
  pickemsStats,
  isSuperadmin,
  adminEmails,
  superadminEmail,
}: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<'matches' | 'scenarios' | 'pickem' | 'users'>('matches');

  const tabStyle = (isActive: boolean) => ({
    padding: '0.75rem 1.5rem',
    border: 'none',
    backgroundColor: isActive ? 'var(--wc-accent)' : 'var(--wc-surface)',
    color: isActive ? '#2a1a00' : 'var(--wc-text)',
    cursor: 'pointer',
    fontWeight: isActive ? 600 : 500,
    borderTopLeftRadius: '0.375rem',
    borderTopRightRadius: '0.375rem',
  });

  const contentStyle = {
    backgroundColor: 'var(--wc-surface)',
    border: '1px solid var(--wc-border)',
    borderTop: 'none',
    borderBottomLeftRadius: '0.375rem',
    borderBottomRightRadius: '0.375rem',
    padding: '2rem',
  };

  return (
    <>
      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--wc-border)', marginBottom: 0 }}>
        <button
          onClick={() => setActiveTab('matches')}
          style={tabStyle(activeTab === 'matches')}
        >
          📋 Match Results
        </button>
        <button
          onClick={() => setActiveTab('scenarios')}
          style={tabStyle(activeTab === 'scenarios')}
        >
          🧪 Scenarios
        </button>
        <button
          onClick={() => setActiveTab('pickem')}
          style={tabStyle(activeTab === 'pickem')}
        >
          🎯 Pick&apos;em
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={tabStyle(activeTab === 'users')}
        >
          👥 User Management
        </button>
      </div>

      {/* Tab content */}
      <div style={contentStyle}>
        {/* Match Results tab */}
        {activeTab === 'matches' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1.5rem' }}>
              Match Results
            </h2>
            <MatchEditor initialMatches={initialMatches} />
          </div>
        )}

        {/* Scenarios tab */}
        {activeTab === 'scenarios' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1.5rem' }}>
              Group-Stage Scenarios
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Simulate group results and preview qualification outcomes.
            </p>
            <Link
              href="/worldcup2026/scenarios"
              className="btn"
              style={{ backgroundColor: 'var(--wc-accent)', color: '#2a1a00', fontWeight: 600 }}
            >
              Go to Scenarios →
            </Link>
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
                <Link href="/predictions/leaderboard" style={{ fontSize: '0.85rem' }}>
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

            {/* Simulation & Management */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: 'var(--wc-text)', fontSize: '1.1rem', marginBottom: '1rem' }}>
                Simulation
              </h3>
              <p style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Fill the leaderboard with test data to stress-test the system.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link
                  href="/admin/simulate-pickem"
                  className="btn"
                  style={{
                    backgroundColor: 'var(--wc-accent)',
                    color: '#2a1a00',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Go to Simulator →
                </Link>
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
            <UsersClient initialEmails={adminEmails} superadmin={superadminEmail} />
          </div>
        )}
      </div>
    </>
  );
}
