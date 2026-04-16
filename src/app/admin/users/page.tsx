import Link from 'next/link';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdmin();

  const rows = await query<{ email: string }>(
    `SELECT email FROM admin_user ORDER BY email`,
  );

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          Administrators
        </h1>
        <Link href="/admin/dashboard" style={{ fontSize: '0.9rem' }}>
          ← Back to dashboard
        </Link>
      </div>

      <p style={{ color: 'var(--wc-text-muted)' }}>
        Users whose Google e-mail matches any of these addresses will be granted admin
        access after signing in.
      </p>

      <UsersClient
        initialEmails={rows.map((r) => r.email)}
        superadmin={SUPERADMIN_EMAIL}
      />
    </div>
  );
}
