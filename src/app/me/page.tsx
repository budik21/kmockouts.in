import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import DeleteAccountButton from './DeleteAccountButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My profile — Knockouts.in',
  robots: { index: false, follow: false },
};

export default async function MePage() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (!session?.user?.email) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent('/me')}`);
  }

  const name = session.user.name || session.user.email;

  return (
    <main className="container py-4">
      <div className="me-hero">
        <h1 className="me-hero-title">Hi, {name}!</h1>
        <p className="me-hero-subtitle">Manage your Knockouts.in profile.</p>
      </div>

      <div className="row g-4 me-tiles">
        <div className="col-md-6">
          <Link href="/me/notifications" className="me-tile">
            <div className="me-tile-icon">🔔</div>
            <div className="me-tile-title">Notification settings</div>
            <div className="me-tile-desc">
              Choose which e-mails you&apos;d like to receive after your tips are scored.
            </div>
          </Link>
        </div>
        <div className="col-md-6">
          <Link href="/pickem/tips" className="me-tile">
            <div className="me-tile-icon">🎯</div>
            <div className="me-tile-title">Pick&apos;em</div>
            <div className="me-tile-desc">
              Enter or review your predictions for all group-stage matches.
            </div>
          </Link>
        </div>
      </div>

      <div className="me-danger-zone">
        <h2 className="me-danger-title">Danger zone</h2>
        <p className="me-danger-text">
          Deleting your account removes your profile, all your predictions and your
          leaderboard entry. This cannot be undone.
        </p>
        <DeleteAccountButton />
      </div>
    </main>
  );
}
