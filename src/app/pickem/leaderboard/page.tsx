import { cachedQuery } from '@/lib/cached-db';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import Link from 'next/link';
import type { Metadata } from 'next';
import LeaderboardTable from './LeaderboardTable';
import LeaderboardViews, { type LeaderboardView } from './LeaderboardViews';
import LeaderboardRecalcBanner from './LeaderboardRecalcBanner';
import LeaderboardSubheader, { type LastScoredMatch } from './LeaderboardSubheader';
import { SITE_URL } from '@/lib/seo';
import { auth } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { disambiguateNames } from '@/lib/name-disambiguate';

// Opt out of build-time static prerendering. Without this, Next.js renders
// the page during `next build` using whatever `tip.points` values exist then
// (often NULL right after a simulate/scenario) and serves that stale HTML
// after deploy until a `revalidateTag(LEADERBOARD_TAG)` fires.
// The underlying queries still use tag-based `unstable_cache`, so DB load is unchanged.
export const dynamic = 'force-dynamic';

// Tag-based on-demand revalidation via `revalidateTag(LEADERBOARD_TAG)`,
// triggered from /api/tips/recalculate and admin match/scenarios endpoints.

export const metadata: Metadata = {
  title: 'Global Leaderboard — FIFA World Cup 2026',
  description:
    'See how all public predictors rank for the FIFA World Cup 2026. Compare points, exact scores and correct outcomes.',
  alternates: { canonical: '/pickem/leaderboard' },
  openGraph: {
    title: 'Global Leaderboard — FIFA World Cup 2026',
    description:
      'Ranking of all public predictors for the FIFA World Cup 2026.',
    url: `${SITE_URL}/pickem/leaderboard`,
  },
};

export interface LeaderboardRow {
  shareToken: string;
  name: string;
  nameSuffix: string | null;
  totalTips: number;
  exact: number;
  outcome: number;
  wrong: number;
  pending: number;
  totalPoints: number;
}

interface BaseUserRow {
  id: number;
  share_token: string;
  name: string;
  email: string;
}

interface GroupAggRow {
  user_id: number;
  total: string; exact: string; outcome: string; wrong: string; pending: string;
}

interface KoAggRow {
  user_id: number;
  total: string; exact: string; advance: string; wrong: string; pending: string; points: string;
}

interface PickAggRow {
  user_id: number;
  total: string; correct: string; wrong: string; pending: string; points: string;
}

interface LastScoredDbRow {
  home_name: string;
  home_short: string;
  home_code: string;
  home_fifa: number | null;
  away_name: string;
  away_short: string;
  away_code: string;
  away_fifa: number | null;
  home_goals: number;
  away_goals: number;
  kick_off: string;
}

export default async function LeaderboardPage() {
  const session = await auth().catch(() => null);
  const currentUserToken = session?.shareToken ?? null;

  // Play-off pick'em is feature-flagged. While it's off, the leaderboard is the
  // original group-stage-only table: no knockout queries run and no All/Groups/
  // Play-off toggle is rendered, so nothing about the upcoming feature leaks.
  const playoffEnabled = await isFeatureEnabled('playoff_pickem', false);

  // Base list of public predictors + the point sources. Group-stage tips always;
  // knockout match tips + top-4 picks only when the play-off feature is live.
  const [baseUsers, groupAgg] = await Promise.all([
    cachedQuery<BaseUserRow>(
      `SELECT id, share_token, name, email FROM tipster_user WHERE tips_public = true`,
      [], [LEADERBOARD_TAG],
    ),
    cachedQuery<GroupAggRow>(
      `SELECT user_id,
         COUNT(*)                                 AS total,
         COUNT(*) FILTER (WHERE points = 4)        AS exact,
         COUNT(*) FILTER (WHERE points = 1)        AS outcome,
         COUNT(*) FILTER (WHERE points = 0)        AS wrong,
         COUNT(*) FILTER (WHERE points IS NULL)    AS pending
       FROM tip GROUP BY user_id`,
      [], [LEADERBOARD_TAG],
    ),
  ]);

  const [koAgg, pickAgg, koFinishedRows] = playoffEnabled
    ? await Promise.all([
        cachedQuery<KoAggRow>(
          `SELECT kt.user_id,
             COUNT(*)                                                                              AS total,
             COUNT(*) FILTER (WHERE km.status = 'FINISHED' AND kt.home_goals = km.home_goals
                                     AND kt.away_goals = km.away_goals)                            AS exact,
             COUNT(*) FILTER (WHERE km.status = 'FINISHED' AND kt.advance_team_id = km.advancing_team_id) AS advance,
             COUNT(*) FILTER (WHERE kt.points = 0)                                                 AS wrong,
             COUNT(*) FILTER (WHERE kt.points IS NULL)                                             AS pending,
             COALESCE(SUM(kt.points), 0)                                                           AS points
           FROM knockout_tip kt JOIN knockout_match km ON km.match_number = kt.match_number
           GROUP BY kt.user_id`,
          [], [LEADERBOARD_TAG],
        ),
        cachedQuery<PickAggRow>(
          `SELECT user_id,
             COUNT(*)                                AS total,
             COUNT(*) FILTER (WHERE points > 0)       AS correct,
             COUNT(*) FILTER (WHERE points = 0)       AS wrong,
             COUNT(*) FILTER (WHERE points IS NULL)   AS pending,
             COALESCE(SUM(points), 0)                 AS points
           FROM playoff_pick GROUP BY user_id`,
          [], [LEADERBOARD_TAG],
        ),
        cachedQuery<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM knockout_match WHERE status = 'FINISHED'`,
          [], [LEADERBOARD_TAG],
        ),
      ])
    : [[] as KoAggRow[], [] as PickAggRow[], [] as { cnt: string }[]];

  const groupBy = new Map(groupAgg.map((r) => [r.user_id, r]));
  const koBy = new Map(koAgg.map((r) => [r.user_id, r]));
  const pickBy = new Map(pickAgg.map((r) => [r.user_id, r]));

  // Disambiguate same-name users with email-domain (or local-part) suffix.
  // Raw e-mails stay server-side; only the bare name + suffix fragment ship.
  const disambiguated = disambiguateNames(baseUsers);
  const suffixById = new Map(disambiguated.map((u) => [u.id, u.nameSuffix]));

  const n = (v: string | undefined) => (v ? parseInt(v, 10) : 0);

  function buildRow(u: BaseUserRow, kind: 'all' | 'groups' | 'playoff'): LeaderboardRow | null {
    const g = groupBy.get(u.id);
    const k = koBy.get(u.id);
    const p = pickBy.get(u.id);
    const gTotal = n(g?.total), gExact = n(g?.exact), gOutcome = n(g?.outcome), gWrong = n(g?.wrong), gPending = n(g?.pending);
    const gPoints = gExact * 4 + gOutcome;
    const kTotal = n(k?.total), kExact = n(k?.exact), kAdvance = n(k?.advance), kWrong = n(k?.wrong), kPending = n(k?.pending), kPoints = n(k?.points);
    const pTotal = n(p?.total), pCorrect = n(p?.correct), pWrong = n(p?.wrong), pPending = n(p?.pending), pPoints = n(p?.points);

    const base = { shareToken: u.share_token, name: u.name, nameSuffix: suffixById.get(u.id) ?? null };

    if (kind === 'groups') {
      if (gTotal === 0) return null;
      return { ...base, totalTips: gTotal, exact: gExact, outcome: gOutcome, wrong: gWrong, pending: gPending, totalPoints: gPoints };
    }
    if (kind === 'playoff') {
      if (kTotal + pTotal === 0) return null;
      return {
        ...base,
        totalTips: kTotal + pTotal,
        exact: kExact,
        outcome: kAdvance + pCorrect,
        wrong: kWrong + pWrong,
        pending: kPending + pPending,
        totalPoints: kPoints + pPoints,
      };
    }
    // all
    if (gTotal + kTotal + pTotal === 0) return null;
    return {
      ...base,
      totalTips: gTotal + kTotal + pTotal,
      exact: gExact + kExact,
      outcome: gOutcome + kAdvance + pCorrect,
      wrong: gWrong + kWrong + pWrong,
      pending: gPending + kPending + pPending,
      totalPoints: gPoints + kPoints + pPoints,
    };
  }

  const allData = baseUsers.map((u) => buildRow(u, 'all')).filter((r): r is LeaderboardRow => r !== null);
  const groupsData = baseUsers.map((u) => buildRow(u, 'groups')).filter((r): r is LeaderboardRow => r !== null);
  const playoffData = baseUsers.map((u) => buildRow(u, 'playoff')).filter((r): r is LeaderboardRow => r !== null);

  // Switch the default view to Play-off once the first knockout match finishes.
  const playoffStarted = n(koFinishedRows[0]?.cnt) > 0;
  const defaultView: LeaderboardView = playoffStarted ? 'playoff' : 'all';
  const defaultData = defaultView === 'playoff' ? playoffData : allData;

  // Current user's rank in the default view (heading widget; no client JS).
  const totalRanked = defaultData.length;
  const currentUserEntry: { rank: number; totalPoints: number; shareToken: string; totalRanked: number } | null = (() => {
    if (!currentUserToken) return null;
    const sorted = [...defaultData].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exact !== a.exact) return b.exact - a.exact;
      if (b.outcome !== a.outcome) return b.outcome - a.outcome;
      if (a.totalTips !== b.totalTips) return a.totalTips - b.totalTips;
      return (
        a.name.localeCompare(b.name) ||
        (a.nameSuffix ?? '').localeCompare(b.nameSuffix ?? '')
      );
    });
    const idx = sorted.findIndex((r) => r.shareToken === currentUserToken);
    if (idx === -1) return null;
    return { rank: idx + 1, totalPoints: sorted[idx].totalPoints, shareToken: currentUserToken, totalRanked };
  })();

  const lastScoredRows = await cachedQuery<LastScoredDbRow>(
    `
    SELECT
      ht.name AS home_name, ht.short_name AS home_short, ht.country_code AS home_code,
      ht.fifa_ranking AS home_fifa,
      at.name AS away_name, at.short_name AS away_short, at.country_code AS away_code,
      at.fifa_ranking AS away_fifa,
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
        homeFifa: lastScoredRows[0].home_fifa,
        awayName: lastScoredRows[0].away_name,
        awayShort: lastScoredRows[0].away_short,
        awayCode: lastScoredRows[0].away_code,
        awayFifa: lastScoredRows[0].away_fifa,
        homeGoals: lastScoredRows[0].home_goals,
        awayGoals: lastScoredRows[0].away_goals,
        kickOff: lastScoredRows[0].kick_off,
      }
    : null;

  return (
    <main className="container py-4">
      <div className="leaderboard-header">
        <h1 className="mb-1">Global Leaderboard</h1>
        {!session && (
          <Link href="/pickem" className="leaderboard-join-btn">
            🏆 Join Pick&apos;em
          </Link>
        )}
      </div>
      <LeaderboardSubheader
        description="Ranking of all public predictors for the FIFA World Cup 2026."
        lastScored={lastScored}
        currentUserEntry={currentUserEntry}
      />

      <LeaderboardRecalcBanner />

      {playoffEnabled ? (
        <LeaderboardViews
          all={allData}
          groups={groupsData}
          playoff={playoffData}
          defaultView={defaultView}
          currentUserToken={currentUserToken}
        />
      ) : (
        <LeaderboardTable rows={groupsData} currentUserToken={currentUserToken} />
      )}
    </main>
  );
}
