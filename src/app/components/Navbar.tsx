import NavbarClient from './NavbarClient';

// IMPORTANT: do NOT read the signed-in user (`auth()`) here. The navbar lives
// in the root layout, whose HTML is cached at the Cloudflare edge ("Cache
// Everything"). Anything user-specific rendered on the server would be baked
// into that shared HTML and served to other visitors — that is how user A's
// avatar showed up for user B. NavbarClient resolves the user client-side from
// /api/auth/session instead, keeping the server HTML user-agnostic and safe to
// cache. See NavbarClient.tsx for details.
export default function Navbar() {
  return <NavbarClient />;
}
