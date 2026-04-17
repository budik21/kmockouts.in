import Link from 'next/link';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { signOut } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import MatchEditor from '../components/MatchEditor';
import PickemActions from '../components/PickemActions';

interface AdminMatchRow {
  id: number;
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number | null;
  away_goals: number | null;
  home_yc: number;
  home_yc2: number;
  home_rc_direct: number;
  home_yc_rc: number;
  away_yc: number;
  away_yc2: number;
  away_rc_direct: number;
  away_yc_rc: number;
  venue: string;
  kick_off: string;
  status: string;
  home_name: string;
  home_short: string;
  home_cc: string;
  away_name: string;
  away_short: string;
  away_cc: string;
}

export interface AdminMatch {
  id: number;
  groupId: string;
  round: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  homeYcRc: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  awayYcRc: number;
  venue: string;
  kickOff: string;
  status: string;
  homeTeam: { name: string; shortName: string; countryCode: string };
  awayTeam: { name: string; shortName: string; countryCode: string };
}

interface PickemStatsRow {
  total: string;
  with_consent: string;
  without_consent: string;
}

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAdmin();

  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  const isSuperadmin = session?.user?.email === SUPERADMIN_EMAIL;

  const [matchRows, statsRows] = await Promise.all([
    query<AdminMatchRow>(`
      SELECT m.*,
        ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
        at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc
      FROM match m
      JOIN team ht ON m.home_team_id = ht.id
      JOIN team at2 ON m.away_team_id = at2.id
      ORDER BY m.kick_off, m.group_id, m.id
    `),
    query<PickemStatsRow>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE tips_public = true)::text AS with_consent,
        COUNT(*) FILTER (WHERE tips_public = false)::text AS without_consent
      FROM tipster_user
    `),
  ]);

  const matches: AdminMatch[] = matchRows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    round: r.round,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    homeYc: r.home_yc,
    homeYc2: r.home_yc2,
    homeRcDirect: r.home_rc_direct,
    homeYcRc: r.home_yc_rc,
    awayYc: r.away_yc,
    awayYc2: r.away_yc2,
    awayRcDirect: r.away_rc_direct,
    awayYcRc: r.away_yc_rc,
    venue: r.venue,
    kickOff: r.kick_off,
    status: r.status,
    homeTeam: { name: r.home_name, shortName: r.home_short, countryCode: r.home_cc },
    awayTeam: { name: r.away_name, shortName: r.away_short, countryCode: r.away_cc },
  }));

  const stats = statsRows[0] ?? { total: '0', with_consent: '0', without_consent: '0' };

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          Admin Dashboard
        </h1>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/admin' });
          }}
        >
          <button
            type="submit"
            className="btn btn-sm"
            style={{
              backgroundColor: 'var(--wc-surface)',
              color: 'var(--wc-text)',
              border: '1px solid var(--wc-border)',
            }}
          >
            Sign out
          </button>
        </form>
      </div>

      {/* Quick-action cards */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-4">
          <Link
            href="/admin/users"
            className="d-block p-3 rounded text-decoration-none h-100"
            style={{ backgroundColor: 'var(--wc-surface)', color: 'var(--wc-text)', border: '1px solid var(--wc-border)' }}
          >
            <div style={{ fontSize: '1.6rem' }}>👥</div>
            <div className="fw-semibold">Administrators</div>
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
              Add or remove admin access by e-mail.
            </div>
          </Link>
        </div>
        <div className="col-sm-6 col-lg-4">
          <Link
            href="/worldcup2026/scenarios"
            className="d-block p-3 rounded text-decoration-none h-100"
            style={{ backgroundColor: 'var(--wc-surface)', color: 'var(--wc-text)', border: '1px solid var(--wc-border)' }}
          >
            <div style={{ fontSize: '1.6rem' }}>🧪</div>
            <div className="fw-semibold">Group-stage scenarios</div>
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
              Simulate group results and preview qualification outcomes.
            </div>
          </Link>
        </div>
        <div className="col-sm-6 col-lg-4">
          <Link
            href="/admin/simulate-pickem"
            className="d-block p-3 rounded text-decoration-none h-100"
            style={{ backgroundColor: 'var(--wc-surface)', color: 'var(--wc-text)', border: '1px solid var(--wc-border)' }}
          >
            <div style={{ fontSize: '1.6rem' }}>🎯</div>
            <div className="fw-semibold">Pick&apos;em simulation</div>
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
              Populate 55 test tipsters to stress-test the public leaderboard.
            </div>
          </Link>
        </div>
      </div>

      {/* Pick'em stats widget */}
      <div
        className="p-3 rounded mb-4"
        style={{ backgroundColor: 'var(--wc-surface)', border: '1px solid var(--wc-border)' }}
      >
        <div className="d-flex align-items-baseline justify-content-between mb-2">
          <h2 style={{ color: 'var(--wc-text)', fontSize: '1.1rem', margin: 0 }}>
            Pick&apos;em tipsters
          </h2>
          <Link href="/predictions/leaderboard" style={{ fontSize: '0.85rem' }}>
            View public leaderboard →
          </Link>
        </div>
        <div className="row g-3">
          <div className="col-4">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Total</div>
            <div style={{ color: 'var(--wc-text)', fontSize: '1.6rem', fontWeight: 600 }}>
              {stats.total}
            </div>
          </div>
          <div className="col-4">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>With consent</div>
            <div style={{ color: 'var(--wc-accent)', fontSize: '1.6rem', fontWeight: 600 }}>
              {stats.with_consent}
            </div>
          </div>
          <div className="col-4">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Without consent</div>
            <div style={{ color: 'var(--wc-text)', fontSize: '1.6rem', fontWeight: 600, opacity: 0.6 }}>
              {stats.without_consent}
            </div>
          </div>
        </div>
      </div>

      {/* Pick'em management actions */}
      <PickemActions isSuperadmin={isSuperadmin} />

      <h2 style={{ color: 'var(--wc-text)', fontSize: '1.2rem' }} className="mb-2">
        Match results
      </h2>
      <MatchEditor initialMatches={matches} />
    </div>
  );
}
