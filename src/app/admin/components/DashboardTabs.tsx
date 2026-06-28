'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminMatch } from '../dashboard/page';
import type { PickemStatsRow } from '../dashboard/page';
import type { ScenarioMeta } from '@/app/worldcup2026/scenarios/page';
import MatchEditor from './MatchEditor';
import KnockoutEditor from './KnockoutEditor';
import PickemActions from './PickemActions';
import TipstersTab, { type TipsterRow } from './TipstersTab';
import LeaguesTab, { type LeagueRow } from './LeaguesTab';
import TipsTab, { type TipRow } from './TipsTab';
import PickemMatchesTab, { type MatchTipStats } from './PickemMatchesTab';
import type { PlayoffTipRow, PlayoffPickRow } from './PlayoffTipsTab';
import UsersClient from '../users/UsersClient';
import EmailsTab from './EmailsTab';
import FeatureFlagsClient from './FeatureFlagsClient';
import AiPredictionsActions, { type AiTeamOption } from './AiPredictionsActions';
import CloudflareTab from './CloudflareTab';
import TwitterTab from './TwitterTab';
import ScenarioPicker from '@/app/components/ScenarioPicker';
import type { FeatureFlag } from '@/lib/feature-flags';
import type { AiPredictionModelKey } from '@/lib/ai-model';

interface DashboardTabsProps {
  initialMatches: AdminMatch[];
  pickemsStats: PickemStatsRow;
  tipsters: TipsterRow[];
  leagues: LeagueRow[];
  tips: TipRow[];
  matchTipStats: MatchTipStats[];
  playoffMatchTipStats: MatchTipStats[];
  playoffTips: PlayoffTipRow[];
  playoffPicks: PlayoffPickRow[];
  isSuperadmin: boolean;
  adminEmails: string[];
  superadminEmail: string;
  scenarios: ScenarioMeta[];
  activeScenario: number | null;
  featureFlags: FeatureFlag[];
  envLocks: Record<string, string>;
  envDocsHtml: string;
  aiTeams: AiTeamOption[];
  aiGroups: string[];
  aiEnvEnabled: boolean;
  aiGenerationFlagEnabled: boolean;
  aiDisplayFlagEnabled: boolean;
  aiModel: AiPredictionModelKey;
  playoffEnabled: boolean;
  initialTab?: TabKey;
}

type TabKey = 'matches' | 'knockout' | 'scenarios' | 'pickem' | 'emails' | 'users' | 'flags' | 'ai' | 'twitter' | 'cloudflare' | 'env';
type PickemSubTab = 'management' | 'matches' | 'tipsters' | 'leagues' | 'tips';

export default function DashboardTabs({
  initialMatches,
  pickemsStats,
  tipsters,
  leagues,
  tips,
  matchTipStats,
  playoffMatchTipStats,
  playoffTips,
  playoffPicks,
  isSuperadmin,
  adminEmails,
  superadminEmail,
  scenarios,
  activeScenario,
  featureFlags,
  envLocks,
  envDocsHtml,
  aiTeams,
  aiGroups,
  aiEnvEnabled,
  aiGenerationFlagEnabled,
  aiDisplayFlagEnabled,
  aiModel,
  playoffEnabled,
  initialTab,
}: DashboardTabsProps) {
  // Default to the Play-off tab when the bracket is live (admins spend the
  // knockout phase entering results there); otherwise the group-stage results.
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? (playoffEnabled ? 'knockout' : 'matches'));
  const [pickemSubTab, setPickemSubTab] = useState<PickemSubTab>('management');

  const subTabButtonStyle = (isActive: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    color: isActive ? 'var(--wc-text)' : 'var(--wc-text-muted)',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0.4rem 0',
    marginRight: '1.25rem',
    borderBottom: isActive ? '2px solid var(--wc-accent)' : '2px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
  });

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
        {playoffEnabled && (
          <button onClick={() => setActiveTab('knockout')} style={tabButtonStyle(activeTab === 'knockout')}>
            Play-off
          </button>
        )}
        <button onClick={() => setActiveTab('scenarios')} style={tabButtonStyle(activeTab === 'scenarios')}>
          Scenarios
        </button>
        <button onClick={() => setActiveTab('pickem')} style={tabButtonStyle(activeTab === 'pickem')}>
          Pick&apos;em
        </button>
        <button onClick={() => setActiveTab('emails')} style={tabButtonStyle(activeTab === 'emails')}>
          Emails
        </button>
        <button onClick={() => setActiveTab('users')} style={tabButtonStyle(activeTab === 'users')}>
          User Management
        </button>
        {isSuperadmin && (
          <button onClick={() => setActiveTab('flags')} style={tabButtonStyle(activeTab === 'flags')}>
            Feature Flags
          </button>
        )}
        {isSuperadmin && (
          <button onClick={() => setActiveTab('ai')} style={tabButtonStyle(activeTab === 'ai')}>
            AI Predictions
          </button>
        )}
        {isSuperadmin && (
          <button onClick={() => setActiveTab('twitter')} style={tabButtonStyle(activeTab === 'twitter')}>
            Twitter
          </button>
        )}
        {isSuperadmin && (
          <button onClick={() => setActiveTab('cloudflare')} style={tabButtonStyle(activeTab === 'cloudflare')}>
            Cloudflare
          </button>
        )}
        {isSuperadmin && (
          <button onClick={() => setActiveTab('env')} style={tabButtonStyle(activeTab === 'env')}>
            Env Vars
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

        {/* Play-off (knockout) results tab */}
        {playoffEnabled && activeTab === 'knockout' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '0.5rem' }}>
              Play-off Results
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Enter knockout results — score after 90′, after extra time, and the penalty shoot-out.
              Saving derives who advances, propagates them into later rounds, and rescores every
              play-off tip and top-4 pick.
            </p>
            <KnockoutEditor />
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
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Pick&apos;em
            </h2>

            {/* Sub-tab navigation */}
            <div style={{ borderBottom: '1px solid var(--wc-border)', marginBottom: '1.5rem', display: 'flex' }}>
              <button
                onClick={() => setPickemSubTab('management')}
                style={subTabButtonStyle(pickemSubTab === 'management')}
              >
                Management
              </button>
              <button
                onClick={() => setPickemSubTab('matches')}
                style={subTabButtonStyle(pickemSubTab === 'matches')}
              >
                Matches
              </button>
              <button
                onClick={() => setPickemSubTab('tipsters')}
                style={subTabButtonStyle(pickemSubTab === 'tipsters')}
              >
                Tipsters
              </button>
              <button
                onClick={() => setPickemSubTab('leagues')}
                style={subTabButtonStyle(pickemSubTab === 'leagues')}
              >
                Leagues
              </button>
              <button
                onClick={() => setPickemSubTab('tips')}
                style={subTabButtonStyle(pickemSubTab === 'tips')}
              >
                Tips
              </button>
            </div>

            {/* Management sub-tab */}
            {pickemSubTab === 'management' && (
              <div>
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

            {/* Matches sub-tab — group-stage + play-off fixtures with tip distribution */}
            {pickemSubTab === 'matches' && (
              <div>
                <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
                  Every fixture with its tip distribution — how many tips were placed,
                  the share predicting a home win, draw or away win, and the most-tipped exact score.
                  Use <strong>Copy AI prompt</strong> to grab a ready-made image-generation prompt
                  (filled with this match&apos;s data) for a social-media infographic collage.
                  {playoffEnabled && <> Switch to <strong>Play-off</strong> for the knockout bracket.</>}
                </p>
                <PickemMatchesTab
                  matches={matchTipStats}
                  playoffMatches={playoffMatchTipStats}
                  playoffEnabled={playoffEnabled}
                />
              </div>
            )}

            {/* Tipsters sub-tab — sign-ups grouped by day */}
            {pickemSubTab === 'tipsters' && (
              <div>
                <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2 mb-2">
                  <p style={{ color: 'var(--wc-text-muted)', margin: 0 }}>
                    Everyone signed up to the prediction game, grouped by the day they joined
                    (newest first). Click a day to expand it.
                  </p>
                  <span style={{ color: 'var(--wc-text)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                    Total:{' '}
                    <strong style={{ color: 'var(--wc-accent)' }}>{tipsters.length}</strong>{' '}
                    {tipsters.length === 1 ? 'tipster' : 'tipsters'}
                  </span>
                </div>
                <TipstersTab tipsters={tipsters} />
              </div>
            )}

            {/* Leagues sub-tab — created leagues grouped by day */}
            {pickemSubTab === 'leagues' && (
              <div>
                <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2 mb-2">
                  <p style={{ color: 'var(--wc-text-muted)', margin: 0 }}>
                    Every league created in the prediction game, grouped by the day it was
                    created (newest first). Click a day to expand it.
                  </p>
                  <span style={{ color: 'var(--wc-text)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                    Total:{' '}
                    <strong style={{ color: 'var(--wc-accent)' }}>{leagues.length}</strong>{' '}
                    {leagues.length === 1 ? 'league' : 'leagues'}
                  </span>
                </div>
                <LeaguesTab leagues={leagues} />
              </div>
            )}

            {/* Tips sub-tab — placed tips grouped by day */}
            {pickemSubTab === 'tips' && (
              <div>
                <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2 mb-2">
                  <p style={{ color: 'var(--wc-text-muted)', margin: 0 }}>
                    Every tip placed in the prediction game, grouped by the day it was
                    submitted (newest first). Finished matches show the points earned.
                    Click a day to expand it.
                    {playoffEnabled && <> Switch to <strong>Play-off</strong> for knockout tips and top-4 picks.</>}
                  </p>
                  <span style={{ color: 'var(--wc-text)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                    Total:{' '}
                    <strong style={{ color: 'var(--wc-accent)' }}>{tips.length}</strong>{' '}
                    {tips.length === 1 ? 'tip' : 'tips'}
                  </span>
                </div>
                <TipsTab
                  tips={tips}
                  playoffTips={playoffTips}
                  playoffPicks={playoffPicks}
                  playoffEnabled={playoffEnabled}
                />
              </div>
            )}
          </div>
        )}

        {/* Emails tab */}
        {activeTab === 'emails' && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Emails
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Send a templated e-mail campaign to selected tipsters. Pick a template, review and
              adjust the pre-filled recipient list, then send. Every recipient gets an individually
              addressed e-mail.
            </p>
            <EmailsTab />
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
            <FeatureFlagsClient initialFlags={featureFlags} isSuperadmin={isSuperadmin} envLocks={envLocks} />
          </div>
        )}

        {/* AI Predictions tab — superadmin only */}
        {activeTab === 'ai' && isSuperadmin && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              AI Predictions
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Force-regenerate Claude scenario summaries for a team or a whole group. Existing
              cached summaries are overwritten without confirmation. Both the env kill-switch
              and the <code>ai_predictions</code> flag are bypassed for these actions. After the
              run, application + Cloudflare caches are purged and warmed.
            </p>
            <AiPredictionsActions
              teams={aiTeams}
              groups={aiGroups}
              envEnabled={aiEnvEnabled}
              generationFlagEnabled={aiGenerationFlagEnabled}
              displayFlagEnabled={aiDisplayFlagEnabled}
              initialModel={aiModel}
            />
          </div>
        )}

        {/* Twitter tab — superadmin only */}
        {activeTab === 'twitter' && isSuperadmin && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Twitter (X)
            </h2>
            <TwitterTab />
          </div>
        )}

        {/* Cloudflare tab — superadmin only */}
        {activeTab === 'cloudflare' && isSuperadmin && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Cloudflare
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Purge the Cloudflare edge cache (whole site, one group, or one team) and the
              matching Next.js caches, then re-warm the affected World&nbsp;Cup pages so the
              next visitor hits a warm cache instead of a cold render. No-op on the Cloudflare
              side when <code>CF_ZONE_ID</code>/<code>CF_API_TOKEN</code> are unset.
            </p>
            <CloudflareTab teams={aiTeams} groups={aiGroups} />
          </div>
        )}

        {/* Env Vars tab — superadmin only */}
        {activeTab === 'env' && isSuperadmin && (
          <div>
            <h2 style={{ color: 'var(--wc-text)', fontSize: '1.3rem', marginTop: 0, marginBottom: '1rem' }}>
              Environment Variables
            </h2>
            <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
              Reference docs for every env var the app reads. Source file: <code>docs/env-variables.md</code>.
            </p>
            <style>{`
              .env-docs {
                background-color: rgba(255, 255, 255, 0.03);
                border: 1px solid var(--wc-border);
                border-radius: 4px;
                padding: 1.5rem 1.75rem;
                color: var(--wc-text);
                line-height: 1.6;
                font-size: 0.95rem;
              }
              .env-docs h1, .env-docs h2, .env-docs h3 {
                color: var(--wc-text);
                margin-top: 2rem;
                margin-bottom: 0.75rem;
                font-weight: 600;
              }
              .env-docs h1:first-child, .env-docs h2:first-child, .env-docs h3:first-child {
                margin-top: 0;
              }
              .env-docs h1 { font-size: 1.6rem; border-bottom: 1px solid var(--wc-border); padding-bottom: 0.4rem; }
              .env-docs h2 { font-size: 1.25rem; }
              .env-docs h3 { font-size: 1.05rem; color: var(--wc-accent); }
              .env-docs p, .env-docs ul, .env-docs ol { margin-bottom: 0.85rem; }
              .env-docs ul, .env-docs ol { padding-left: 1.4rem; }
              .env-docs li { margin-bottom: 0.3rem; }
              .env-docs code {
                background-color: rgba(255, 255, 255, 0.08);
                padding: 0.1rem 0.35rem;
                border-radius: 3px;
                font-size: 0.88em;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                color: var(--wc-text);
              }
              .env-docs pre {
                background-color: rgba(0, 0, 0, 0.3);
                border: 1px solid var(--wc-border);
                border-radius: 4px;
                padding: 0.9rem 1rem;
                overflow-x: auto;
                font-size: 0.85rem;
                line-height: 1.5;
                margin: 0.85rem 0;
              }
              .env-docs pre code {
                background: none;
                padding: 0;
                font-size: inherit;
                color: var(--wc-text);
              }
              .env-docs hr {
                border: none;
                border-top: 1px solid var(--wc-border);
                margin: 2rem 0;
              }
              .env-docs strong { color: var(--wc-text); font-weight: 600; }
              .env-docs em { color: var(--wc-text-muted); }
              .env-docs a { color: var(--wc-accent); text-decoration: underline; }
              .env-docs blockquote {
                border-left: 3px solid var(--wc-border);
                margin: 0.85rem 0;
                padding: 0.25rem 0 0.25rem 1rem;
                color: var(--wc-text-muted);
              }
            `}</style>
            <div
              className="env-docs"
              dangerouslySetInnerHTML={{ __html: envDocsHtml }}
            />
          </div>
        )}
      </div>
    </>
  );
}
