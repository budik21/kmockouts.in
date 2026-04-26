import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireAdmin } from '@/lib/admin-auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export default async function TwitterNewChooserPage() {
  await requireAdmin();
  const session = await auth();
  if (session?.user?.email !== SUPERADMIN_EMAIL) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="container py-3">
      <style>{`
        .tw-tile {
          display: block;
          padding: 1.5rem;
          border-radius: 0.5rem;
          background-color: rgba(255,255,255,0.03);
          border: 1px solid var(--wc-border);
          color: var(--wc-text);
          text-decoration: none;
          transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
          height: 100%;
        }
        .tw-tile:hover {
          transform: translateY(-2px);
          border-color: var(--wc-accent);
          background-color: rgba(255,255,255,0.06);
          box-shadow: 0 8px 22px rgba(0,0,0,0.35);
          color: var(--wc-text);
          text-decoration: none;
        }
        .tw-tile-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
          color: var(--wc-text);
        }
        .tw-tile-desc {
          font-size: 0.95rem;
          color: var(--wc-text-muted);
          margin: 0;
          line-height: 1.5;
        }
        .tw-tile-icon {
          font-size: 2rem;
          margin-bottom: 0.75rem;
          color: var(--wc-accent);
        }
      `}</style>

      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          New tweet
        </h1>
        <Link
          href="/admin/dashboard?tab=twitter"
          style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}
        >
          ← Back to Twitter
        </Link>
      </div>

      <p style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem' }}>
        Choose what kind of post you want to publish.
      </p>

      <div className="row g-3">
        <div className="col-12 col-md-6">
          <Link href="/admin/twitter/new/simple" className="tw-tile">
            <div className="tw-tile-icon">✏️</div>
            <h2 className="tw-tile-title">Simple post</h2>
            <p className="tw-tile-desc">
              Free text up to 280 characters with an optional image
              (PNG / JPG / GIF, ≤ 5 MB).
            </p>
          </Link>
        </div>

        <div className="col-12 col-md-6">
          <Link href="/admin/twitter/new/scenario" className="tw-tile">
            <div className="tw-tile-icon">📊</div>
            <h2 className="tw-tile-title">Scenario post</h2>
            <p className="tw-tile-desc">
              Pick a team and pre/post-match. Claude drafts the text and we
              auto-generate a graphic with the team flag and qualification
              probabilities. Choose between three layouts before publishing.
              A link to the team page is auto-appended.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
