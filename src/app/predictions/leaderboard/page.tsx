import { cachedQuery } from '@/lib/cached-db';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import type { Metadata } from 'next';
import AdBanner from '@/app/components/AdBanner';
import LeaderboardTable from './LeaderboardTable';
import LeaderboardRecalcBanner from './LeaderboardRecalcBanner';
import LeaderboardSubheader, { type LastScoredMatch } from './LeaderboardSubheader';
import LeaderboardMeWidget from './LeaderboardMeWidget';
import { SITE_URL } from '@/lib/seo';
import { auth } from '@/lib/auth';

// Opt out of build-time static prerendering. Without this, Next.js renders
// the page during `next build` using whatever `tip.points` values exist then
// (often NULL right after a simulate/scenario) and serves that stale HTML
// after deploy until a `revalidateTag(LEADERBOARD_TAG)` fires.
// The underlying queries still use tag-based `unstable_cache`, so DB load is unchanged.
export const dynamic = 'force-dynamic';

// Tag-based on-demand revalidation via `revalidateTag(LEADERBOARD_TAG)`,
// triggered from /api/tips/recalculate and admin match/scenarios endpoints.

export const metadata: Metadata = {
  title: 'Predictions Leaderboard — FIFA World Cup 2026',
  description:
    'See how all public predictors rank for the FIFA World Cup 2026. Compare points, exact scores and correct outcomes.',
  alternates: { canonical: '/predictions/leaderboard' },
  openGraph: {
    title: 'Predictions Leaderboard — FIFA World Cup 2026',
    description:
      'Ranking of all public predictors for the FIFA World Cup 2026.',
    url: `${SITE_URL}/predictions/leaderboard`,
  },
};

export interface LeaderboardRow {
  shareToken: string;
  name: string;
  totalTips: number;
  exact: number;
  outcome: number;
  wrong: number;
  pending: number;
  totalPoints: number;
}

interface DbRow {
  share_token: string;
  name: string;
  total_tips: string;
  exact: string;
  outcome: string;
  wrong: string;
  pending: string;
}

interface LastScoredDbRow {
  home_name: string;
  home_short: string;
  home_code: string;
  away_name: string;
  away_short: string;
  away_code: string;
  home_goals: number;
  away_goals: number;
  kick_off: string;
}

export default async function LeaderboardPage() {
  const session = await auth().catch(() => null);
  const currentUserToken = session?.shareToken ?? null;

  const rows = await cachedQuery<DbRow>(
    `
    SELECT
      u.share_token,
      u.name,
      COUNT(t.id)                                           AS total_tips,
      COUNT(t.id) FILTER (WHERE t.points = 4)               AS exact,
      COUNT(t.id) FILTER (WHERE t.points = 1)               AS outcome,
      COUNT(t.id) FILTER (WHERE t.points = 0)               AS wrong,
      COUNT(t.id) FILTER (WHERE t.points IS NULL)           AS pending
    FROM tipster_user u
    LEFT JOIN tip t ON t.user_id = u.id
    WHERE u.tips_public = true
    GROUP BY u.id, u.share_token, u.name
  `,
    [],
    [LEADERBOARD_TAG],
  );

  const data: LeaderboardRow[] = rows.map((r) => {
    const exact = parseInt(r.exact, 10);
    const outcome = parseInt(r.outcome, 10);
    return {
      shareToken: r.share_token,
      name: r.name,
      totalTips: parseInt(r.total_tips, 10),
      exact,
      outcome,
      wrong: parseInt(r.wrong, 10),
      pending: parseInt(r.pending, 10),
      totalPoints: exact * 4 + outcome,
    };
  });

  // Compute current user's rank server-side so the heading widget needs no client JS
  const currentUserEntry: { rank: number; totalPoints: number; shareToken: string } | null = (() => {
    if (!currentUserToken) return null;
    const sorted = [...data].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exact !== a.exact) return b.exact - a.exact;
      if (b.outcome !== a.outcome) return b.outcome - a.outcome;
      if (a.totalTips !== b.totalTips) return a.totalTips - b.totalTips;
      return a.name.localeCompare(b.name);
    });
    const idx = sorted.findIndex((r) => r.shareToken === currentUserToken);
    if (idx === -1) return null;
    return { rank: idx + 1, totalPoints: sorted[idx].totalPoints, shareToken: currentUserToken };
  })();

  const lastScoredRows = await cachedQuery<LastScoredDbRow>(
    `
    SELECT
      ht.name AS home_name, ht.short_name AS home_short, ht.country_code AS home_code,
      at.name AS away_name, at.short_name AS away_short, at.country_code AS away_code,
      m.home_goals, m.away_goals, m.kick_off
    FROM match m
    JOIN team ht ON ht.id = m.home_team_id
    JOIN team at ON at.id = m.away_team_id
    WHERE m.status = 'FINISHED'
      AND m.home_goals IS NOT NULL
      AND m.away_goals IS NOT NULL
    ORDER BY m.kick_off DESC
    LIMIT 1
    `,
    [],
    [LEADERBOARD_TAG],
  );

  const lastScored: LastScoredMatch | null = lastScoredRows[0]
    ? {
        homeName: lastScoredRows[0].home_name,
        homeShort: lastScoredRows[0].home_short,
        homeCode: lastScoredRows[0].home_code,
        awayName: lastScoredRows[0].away_name,
        awayShort: lastScoredRows[0].away_short,
        awayCode: lastScoredRows[0].away_code,
        homeGoals: lastScoredRows[0].home_goals,
        awayGoals: lastScoredRows[0].away_goals,
        kickOff: lastScoredRows[0].kick_off,
      }
    : null;

  return (
    <main className="container py-4">
      <div className="leaderboard-header">
        <div className="leaderboard-header-left">
          <h1 className="mb-1">Predictions Leaderboard</h1>
          <LeaderboardSubheader
            description="Ranking of all public predictors for the FIFA World Cup 2026."
            lastScored={lastScored}
          />
        </div>
        {currentUserEntry && (
          <LeaderboardMeWidget
            rank={currentUserEntry.rank}
            totalPoints={currentUserEntry.totalPoints}
            shareToken={currentUserEntry.shareToken}
          />
        )}
      </div>

      <LeaderboardRecalcBanner />

      <LeaderboardTable rows={data} currentUserToken={currentUserToken} />

      <div className="mt-4">
        <AdBanner slot="leaderboard" />
      </div>
    </main>
  );
}
