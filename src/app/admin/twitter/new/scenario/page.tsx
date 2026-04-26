import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireAdmin } from '@/lib/admin-auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { listTeamsForSelector } from '@/lib/twitter-context';
import ScenarioPostForm from './ScenarioPostForm';

export const dynamic = 'force-dynamic';

export default async function TwitterNewScenarioPage() {
  await requireAdmin();
  const session = await auth();
  if (session?.user?.email !== SUPERADMIN_EMAIL) {
    redirect('/admin/dashboard');
  }

  const teams = await listTeamsForSelector();

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          Scenario post
        </h1>
        <Link
          href="/admin/twitter/new"
          style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}
        >
          ← Back
        </Link>
      </div>
      <ScenarioPostForm teams={teams} />
    </div>
  );
}
