import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
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
        <div className="me-hero-email" aria-label="Signed-in e-mail address">
          <span className="me-hero-email-label">Signed in as</span>
          <span className="me-hero-email-value">{session.user.email}</span>
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
