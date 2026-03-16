import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Admin | Knockouts.in',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await auth();
  } catch {
    // Auth not configured yet — show sign-in prompt
    session = null;
  }

  // DEV BYPASS: skip auth in development or when Google credentials not configured
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  console.log('[admin] NODE_ENV:', process.env.NODE_ENV, 'googleConfigured:', googleConfigured, 'isDev:', isDev);
  if (googleConfigured && !isDev) {
    if (!session) {
      redirect('/api/auth/signin?callbackUrl=/admin');
    }
  }

  if (googleConfigured && !isDev && !session?.isAdmin) {
    return (
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 text-center">
            <div
              style={{
                fontSize: '4rem',
                marginBottom: '1rem',
              }}
            >
              🔒
            </div>
            <h2 style={{ color: 'var(--wc-text)' }}>Not Authorized</h2>
            <p style={{ color: 'var(--wc-text-muted)', fontSize: '1.1rem' }}>
              Sorry, you are not authorized to view this page.
            </p>
            <p style={{ color: 'var(--wc-text-muted)' }}>
              Contact{' '}
              <a
                href="mailto:radek.budar@gmail.com"
                style={{ color: 'var(--wc-accent)' }}
              >
                radek.budar@gmail.com
              </a>{' '}
              for access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
