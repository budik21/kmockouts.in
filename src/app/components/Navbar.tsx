import { auth } from '@/lib/auth';
import NavbarClient from './NavbarClient';

function computeInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default async function Navbar() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  const user = session?.user?.email
    ? {
        name: session.user.name ?? '',
        email: session.user.email,
        initials: computeInitials(session.user.name ?? '', session.user.email),
      }
    : null;

  return <NavbarClient user={user} />;
}
