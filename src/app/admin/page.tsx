import { redirect } from 'next/navigation';
import { auth, signIn, signOut } from '@/lib/auth';

const SUPERADMIN_EMAIL = 'radek.budar@gmail.com';

export const dynamic = 'force-dynamic';

export default async function AdminLandingPage() {
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  // Dev bypass: go straight to dashboard so local work isn't blocked on OAuth.
  if (!googleConfigured || isDev) {
    redirect('/admin/dashboard');
  }

  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (session?.isAdmin) {
    redirect('/admin/dashboard');
  }

  const signedInButNotAdmin = !!session && !session.isAdmin;

  return (
    <main className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div
            className="p-4 rounded"
            style={{
              backgroundColor: 'var(--wc-surface)',
              border: '1px solid var(--wc-border)',
            }}
          >
            <div style={{ fontSize: '3rem', textAlign: 'center' }}>🔐</div>
            <h1
              className="text-center mb-3"
              style={{ color: 'var(--wc-text)', fontSize: '1.6rem' }}
            >
              Admin Section
            </h1>

            <p style={{ color: 'var(--wc-text-muted)' }}>
              This is the admin section of Knockouts.in. After you sign in, you can:
            </p>
            <ul style={{ color: 'var(--wc-text-muted)' }}>
              <li>Add administrators</li>
              <li>Enter match results</li>
              <li>Simulate group-stage and pick&apos;em results</li>
            </ul>

            {signedInButNotAdmin ? (
              <>
                <div
                  className="p-3 rounded mt-3 mb-3 d-flex gap-2"
                  style={{
                    backgroundColor: 'rgba(255, 193, 7, 0.12)',
                    border: '1px solid rgba(255, 193, 7, 0.4)',
                    color: 'var(--wc-text)',
                  }}
                >
                  <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>⚠️</div>
                  <div>
                    <strong>Not authorized.</strong> You are signed in as{' '}
                    <strong>{session?.user?.email}</strong>, but that address is not on the
                    admin whitelist.
                  </div>
                </div>
                <form
                  action={async () => {
                    'use server';
                    await signOut({ redirectTo: '/admin' });
                  }}
                >
                  <button
                    type="submit"
                    className="btn w-100"
                    style={{
                      backgroundColor: 'var(--wc-surface)',
                      color: 'var(--wc-text)',
                      border: '1px solid var(--wc-border)',
                      padding: '0.7rem',
                      fontSize: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <form
                action={async () => {
                  'use server';
                  await signIn('google', { redirectTo: '/admin/dashboard' });
                }}
                className="mt-4"
              >
                <button
                  type="submit"
                  className="btn w-100"
                  style={{
                    backgroundColor: 'var(--wc-accent)',
                    color: '#fff',
                    padding: '0.7rem',
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                >
                  Sign in with Google
                </button>
              </form>
            )}

            <p
              className="text-center mt-3 mb-0"
              style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}
            >
              Need access? Contact superadmin at{' '}
              <a href={`mailto:${SUPERADMIN_EMAIL}`} style={{ color: 'var(--wc-accent)' }}>
                {SUPERADMIN_EMAIL}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
