import { auth } from './auth';
import { redirect } from 'next/navigation';

/**
 * Server-side helper for admin sub-pages.
 *
 * Fail-closed: requires a session with `isAdmin = true`. No dev/config bypass
 * — missing OAuth env must not silently grant admin access.
 *   - Unauthenticated → redirect to /admin landing page (sign-in lives there).
 *   - Authenticated but not admin → redirect to /admin (landing shows the
 *     "not authorized" state based on session).
 */
export async function requireAdmin(): Promise<void> {
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
 * Fail-closed: no dev/config bypass.
 */
export async function requireAdminApi(): Promise<Response | null> {
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
