import { query } from '@/lib/db';
import type { Metadata } from 'next';
import AdBanner from '@/app/components/AdBanner';
import LeaderboardTable from './LeaderboardTable';
import { SITE_URL } from '@/lib/seo';

export const dynamic = 'force-dynamic';

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

export default async function LeaderboardPage() {
  const rows = await query<DbRow>(`
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
  `);

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

  return (
    <main className="container py-4">
      <h1 className="mb-1">Predictions Leaderboard</h1>
      <p className="text-muted mb-4">
        Ranking of all public predictors for the FIFA World Cup 2026.
      </p>

      <LeaderboardTable rows={data} />

      <div className="mt-4">
        <AdBanner slot="leaderboard" />
      </div>
    </main>
  );
}
