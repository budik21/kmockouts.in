import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { cachedQuery } from '@/lib/cached-db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { LEAGUES_TAG, leagueStandingsTag } from '@/lib/cache-tags';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';
import LeagueLeaderboardTable, { type LeagueRow } from './LeagueLeaderboardTable';
import LeagueMembershipActions from './LeagueMembershipActions';
import { disambiguateNames } from '@/lib/name-disambiguate';

// League pages are public but per-league dynamic — never pre-rendered with
// stale data; data still cached via tag-based unstable_cache and busted
// inside recalculateLeagueStandings().
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ code: string }>;
}

interface LeagueRowDb {
  id: number;
  name: string;
  owner_user_id: number;
  owner_name: string;
  created_at: string;
}

interface StandingDb {
  user_id: number;
  user_name: string;
  user_email: string;
  share_token: string | null;
  total_tips: number;
  exact_count: number;
  outcome_count: number;
  wrong_count: number;
  pending_count: number;
  total_points: number;
  rank: number;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeLeagueCode(rawCode);
  if (!isValidLeagueCode(code)) return { title: 'League not found — Knockouts.in' };

  const league = await queryOne<{ name: string }>(
    'SELECT name FROM pickem_league WHERE code = $1',
    [code],
  );
  if (!league) return { title: 'League not found — Knockouts.in' };

  return {
    title: `${league.name} — Tipping league — Knockouts.in`,
    description: `Standings for the "${league.name}" tipping league for the FIFA World Cup 2026.`,
    alternates: { canonical: `/pickem/leagues/${code}` },
    openGraph: {
      title: `${league.name} — Tipping league`,
      description: `Standings for the "${league.name}" tipping league for the FIFA World Cup 2026.`,
      url: `${SITE_URL}/pickem/leagues/${code}`,
    },
    robots: { index: false, follow: true },
  };
}

export default async function LeaguePage({ params }: Props) {
  const { code: rawCode } = await params;
  const code = normalizeLeagueCode(rawCode);
  if (!isValidLeagueCode(code)) notFound();

  const session = await auth().catch(() => null);
  const myUserId = session?.tipsterId ?? null;

  const league = await queryOne<LeagueRowDb>(
    `SELECT l.id, l.name, l.owner_user_id, owner.name AS owner_name, l.created_at::text AS created_at
       FROM pickem_league l
       JOIN tipster_user owner ON owner.id = l.owner_user_id
      WHERE l.code = $1`,
    [code],
  );
  if (!league) notFound();

  const standings = await cachedQuery<StandingDb>(
    `SELECT s.user_id, u.name AS user_name, u.email AS user_email, u.share_token,
            s.total_tips, s.exact_count, s.outcome_count, s.wrong_count, s.pending_count,
            s.total_points, s.rank
       FROM pickem_league_standings s
       JOIN tipster_user u ON u.id = s.user_id
      WHERE s.league_id = $1
      ORDER BY s.rank ASC`,
    [league.id],
    [leagueStandingsTag(code)],
  );

  // Is the current user a member? Query the source of truth directly rather
  // than relying on the cached standings — after a just-completed invite join
  // the standings cache can still serve a snapshot without the new member,
  // which would render a spurious "Join this league" button.
  const myMembership = myUserId !== null
    ? await queryOne<{ user_id: number }>(
        'SELECT user_id FROM pickem_league_member WHERE league_id = $1 AND user_id = $2',
        [league.id, myUserId],
      )
    : null;
  const isMember = !!myMembership;

  // Owner-of-league flag (so the page can show admin links if needed).
  const isOwner = myUserId !== null && league.owner_user_id === myUserId;

  // Member count from a fresh query so we see members who joined but have no
  // tips yet (they're still in standings as 0/0/0). Cached under LEAGUES_TAG.
  const memberCountRow = await cachedQuery<{ cnt: string }>(
    'SELECT COUNT(*)::text AS cnt FROM pickem_league_member WHERE league_id = $1',
    [league.id],
    [LEAGUES_TAG],
  );
  const memberCount = parseInt(memberCountRow[0]?.cnt ?? '0', 10);

  // Disambiguate same-name members within this league. The raw e-mail stays
  // server-side; only the resolved displayName is sent to the client table.
  const disambiguated = disambiguateNames(
    standings.map((s) => ({ ...s, name: s.user_name, email: s.user_email })),
  );

  const rows: LeagueRow[] = disambiguated.map((s) => ({
    userId: s.user_id,
    name: s.displayName,
    shareToken: s.share_token,
    totalTips: s.total_tips,
    exact: s.exact_count,
    outcome: s.outcome_count,
    wrong: s.wrong_count,
    pending: s.pending_count,
    totalPoints: s.total_points,
    rank: s.rank,
  }));

  return (
    <main className="container py-4">
      <p className="mb-2">
        <Link href="/pickem/tips?tab=leagues" className="text-decoration-none">← Back to my leagues</Link>
      </p>

      <header className="league-header">
        <h1 className="league-title">{league.name}</h1>
        <div className="league-subtitle">
          <span>Tipping league</span>
          <span className="leagues-meta-dot">·</span>
          <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          <span className="leagues-meta-dot">·</span>
          <span>by {league.owner_name}</span>
          <span className="leagues-meta-dot">·</span>
          <span className="league-code-pill">{code}</span>
        </div>
      </header>

      <LeagueMembershipActions
        code={code}
        leagueName={league.name}
        signedIn={myUserId !== null}
        isMember={isMember}
        isOwner={isOwner}
      />

      <LeagueLeaderboardTable rows={rows} myUserId={myUserId} />
    </main>
  );
}
