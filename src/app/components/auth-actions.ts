'use server';

import { signOut } from '@/lib/auth';

// Server-side sign-out. The next-auth/react `signOut()` helper relies on a
// CSRF round-trip that has been flaky in NextAuth v5 beta — using the
// server action invokes Auth.js directly, so the session cookie is reliably
// cleared and the redirect happens via the response.
export async function logoutAction() {
  await signOut({ redirectTo: '/' });
}
