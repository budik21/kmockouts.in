export const metadata = {
  title: 'Admin | Knockouts.in',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth is enforced per-page via `requireAdmin()` from '@/lib/admin-auth'.
  // The /admin landing page itself is public (it hosts the sign-in button).
  return <>{children}</>;
}
