import NavbarClient from './NavbarClient';
import { isFeatureEnabled } from '@/lib/feature-flags';

// IMPORTANT: do NOT read the signed-in user (`auth()`) here. The navbar lives
// in the root layout, whose HTML is cached at the Cloudflare edge ("Cache
// Everything"). Anything user-specific rendered on the server would be baked
// into that shared HTML and served to other visitors — that is how user A's
// avatar showed up for user B. NavbarClient resolves the user client-side from
// /api/auth/session instead, keeping the server HTML user-agnostic and safe to
// cache. See NavbarClient.tsx for details.
export default async function Navbar() {
  // A feature flag is not user-specific, so reading it here keeps the cached
  // navbar HTML identical for everyone (unlike auth()). While the play-off flag
  // is off, the link is absent from the markup entirely — no leak.
  const playoffEnabled = await isFeatureEnabled('playoff_pickem', false);
  // Pass the prop ONLY when on, so the flag's name/value never appears in the
  // navbar RSC payload (present on every page) while the feature is dark.
  return playoffEnabled ? <NavbarClient playoffEnabled /> : <NavbarClient />;
}
