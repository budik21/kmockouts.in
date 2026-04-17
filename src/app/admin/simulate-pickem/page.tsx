import Link from 'next/link';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import SimulateClient from './SimulateClient';

interface StatsRow {
  total: string;
  with_consent: string;
  without_consent: string;
  tip_count: string;
}

export const dynamic = 'force-dynamic';

export default async function SimulatePickemPage() {
  await requireAdmin();

  const rows = await query<StatsRow>(`
    SELECT
      (SELECT COUNT(*) FROM tipster_user)::text AS total,
      (SELECT COUNT(*) FROM tipster_user WHERE tips_public = true)::text AS with_consent,
      (SELECT COUNT(*) FROM tipster_user WHERE tips_public = false)::text AS without_consent,
      (SELECT COUNT(*) FROM tip)::text AS tip_count
  `);
  const stats = rows[0] ?? { total: '0', with_consent: '0', without_consent: '0', tip_count: '0' };

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          Pick&apos;em simulation
        </h1>
        <Link href="/admin/dashboard" style={{ fontSize: '0.9rem' }}>
          ← Back to dashboard
        </Link>
      </div>

      <p style={{ color: 'var(--wc-text-muted)' }}>
        Destructive operations for stress-testing the public pick&apos;em leaderboard.
        Filling wipes <code>tipster_user</code> and <code>tip</code> first, then inserts
        130 fake tipsters with exotic names and completely random tips. All tipsters start
        with 0 points (points = NULL). Run the &quot;Recalculate leaderboard&quot; action
        to score them based on actual match results.
      </p>

      <div
        className="p-3 rounded mb-4"
        style={{ backgroundColor: 'var(--wc-surface)', border: '1px solid var(--wc-border)' }}
      >
        <h2 style={{ color: 'var(--wc-text)', fontSize: '1.05rem' }} className="mb-2">
          Current state
        </h2>
        <div className="row g-3">
          <div className="col-3">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Tipsters</div>
            <div style={{ color: 'var(--wc-text)', fontSize: '1.4rem', fontWeight: 600 }}>
              {stats.total}
            </div>
          </div>
          <div className="col-3">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>With consent</div>
            <div style={{ color: 'var(--wc-accent)', fontSize: '1.4rem', fontWeight: 600 }}>
              {stats.with_consent}
            </div>
          </div>
          <div className="col-3">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Without consent</div>
            <div style={{ color: 'var(--wc-text)', fontSize: '1.4rem', fontWeight: 600, opacity: 0.6 }}>
              {stats.without_consent}
            </div>
          </div>
          <div className="col-3">
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.8rem' }}>Tips</div>
            <div style={{ color: 'var(--wc-text)', fontSize: '1.4rem', fontWeight: 600 }}>
              {stats.tip_count}
            </div>
          </div>
        </div>
      </div>

      <SimulateClient />
    </div>
  );
}
