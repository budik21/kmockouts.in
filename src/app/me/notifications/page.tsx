import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { queryOne } from '@/lib/db';
import NotificationToggles from './NotificationToggles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Notification settings — Knockouts.in',
  robots: { index: false, follow: false },
};

interface Prefs {
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
}

export default async function NotificationsPage() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (!session?.tipsterId) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent('/me/notifications')}`);
  }

  const prefs = await queryOne<Prefs>(
    'SELECT notify_exact_score, notify_winner_only, notify_wrong_tip FROM tipster_user WHERE id = $1',
    [session.tipsterId],
  );

  const initial = {
    exactScore: !!prefs?.notify_exact_score,
    winnerOnly: !!prefs?.notify_winner_only,
    wrongTip: !!prefs?.notify_wrong_tip,
  };

  return (
    <main className="container py-4">
      <p className="mb-2">
        <Link href="/me" className="text-decoration-none">← Back to profile</Link>
      </p>
      <h1 className="mb-2">Notification settings</h1>
      <p className="text-muted mb-4">
        Choose which e-mails you&apos;d like to receive after your tips are scored.
        All notifications are off by default.
      </p>
      <NotificationToggles initial={initial} />
    </main>
  );
}
