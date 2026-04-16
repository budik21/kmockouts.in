import { auth } from './auth';
import { redirect } from 'next/navigation';

/**
 * Server-side helper for admin sub-pages.
 *
 * - In development OR when Google is not configured, grants access (dev bypass).
 * - Otherwise requires a session with `isAdmin = true`.
 *   - Unauthenticated → redirect to /admin landing page (sign-in lives there).
 *   - Authenticated but not admin → redirect to /admin (landing shows the
 *     "not authorized" state based on session).
 */
export async function requireAdmin(): Promise<void> {
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!googleConfigured || isDev) return;

  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (!session?.isAdmin) {
    redirect('/admin');
  }
}

/**
 * For API routes. Returns `null` when authorized, or a Response with 401 when not.
 */
export async function requireAdminApi(): Promise<Response | null> {
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!googleConfigured || isDev) return null;

  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (!session?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
