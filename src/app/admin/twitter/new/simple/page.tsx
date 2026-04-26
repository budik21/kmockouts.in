import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireAdmin } from '@/lib/admin-auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import SimplePostForm from './SimplePostForm';

export const dynamic = 'force-dynamic';

export default async function TwitterNewSimplePage() {
  await requireAdmin();
  const session = await auth();
  if (session?.user?.email !== SUPERADMIN_EMAIL) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          Simple post
        </h1>
        <Link
          href="/admin/twitter/new"
          style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}
        >
          ← Back
        </Link>
      </div>
      <SimplePostForm />
    </div>
  );
}
