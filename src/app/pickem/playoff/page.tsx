import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { SITE_URL } from '@/lib/seo';
import PlayoffLanding from './components/PlayoffLanding';
import PlayoffApp from './components/PlayoffApp';
import {
  getKnockoutMatches,
  getPlayoffTeams,
  getUserKnockoutTips,
  getUserPlayoffPicks,
} from '@/lib/playoff-data';
import { playoffPicksLockAtMs, isPlayoffPicksLocked } from '@/lib/playoff-lock';

export const dynamic = 'force-dynamic';

// Metadata is computed per-request so that, while the feature flag is off, the
// page exposes nothing about the upcoming play-off game — not even in <title>
// or Open Graph tags on the 404 response.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    return { title: 'Page not found — Knockouts.in', robots: { index: false, follow: false } };
  }
  return {
    title: 'Play-off Predictions — FIFA World Cup 2026',
    description:
      'Predict the FIFA World Cup 2026 knockout stage: name the champion, runner-up and losing semifinalists, then tip every bracket match.',
    alternates: { canonical: '/pickem/playoff' },
    openGraph: {
      title: 'Play-off Predictions — FIFA World Cup 2026',
      description: 'Predict the FIFA World Cup 2026 knockout stage and climb the play-off leaderboard.',
      url: `${SITE_URL}/pickem/playoff`,
    },
  };
}

export default async function PlayoffPage() {
  // Feature-flagged: until launch the route behaves as if it doesn't exist.
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    notFound();
  }

  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  // Guests see the landing page with the rules and a sign-in button.
  if (!session?.tipsterId) {
    return <PlayoffLanding />;
  }

  // Registered users go straight to the play-off tipping game.
  const [matches, teams, userTips, userPicks] = await Promise.all([
    getKnockoutMatches(),
    getPlayoffTeams(),
    getUserKnockoutTips(session.tipsterId),
    getUserPlayoffPicks(session.tipsterId),
  ]);

  return (
    <PlayoffApp
      matches={matches}
      teams={teams}
      userTips={userTips}
      userPicks={userPicks}
      picksLockAt={playoffPicksLockAtMs()}
      picksLocked={isPlayoffPicksLocked()}
    />
  );
}
