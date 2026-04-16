import { redirect } from 'next/navigation';
import { auth, signIn, signOut } from '@/lib/auth';

const SUPERADMIN_EMAIL = 'radek.budar@gmail.com';

export const dynamic = 'force-dynamic';

export default async function AdminLandingPage() {
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
                <div className="tipovacka-auth-buttons">
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/admin' });
                    }}
                  >
                    <button
                      type="submit"
                      className="tipovacka-btn"
                      style={{ width: '100%' }}
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="tipovacka-auth-buttons">
                <form
                  action={async () => {
                    'use server';
                    await signIn('google', { redirectTo: '/admin/dashboard' });
                  }}
                >
                  <button
                    type="submit"
                    className="tipovacka-btn tipovacka-btn-google"
                    style={{ width: '100%' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Sign in with Google
                  </button>
                </form>
              </div>
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
