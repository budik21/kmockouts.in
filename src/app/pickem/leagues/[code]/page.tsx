import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { cachedQuery } from '@/lib/cached-db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { LEADERBOARD_TAG, leagueStandingsTag } from '@/lib/cache-tags';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/seo';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { buildLeaderboardRow, type LeaderboardRow } from '@/lib/leaderboard-build';
import LeaderboardViews, { type LeaderboardView } from '../../leaderboard/LeaderboardViews';
import LeaderboardTable from '../../leaderboard/LeaderboardTable';
import LeagueMembershipActions from './LeagueMembershipActions';
import CopyInviteButton from './CopyInviteButton';
import { disambiguateNames } from '@/lib/name-disambiguate';
import { createInviteHash } from '@/lib/league-hash';

// League pages are public but per-league dynamic — never pre-rendered with
// stale data; data still cached via tag-based unstable_cache and busted
// inside recalculateLeagueStandings().
export const dynamic = 'force-dynamic';

const EMPTY_LEAGUE_MESSAGE = 'This league has no members yet. Share the invite link to get people in!';

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

interface MemberDb {
  user_id: number;
  user_name: string;
  user_email: string;
  share_token: string | null;
}

interface GroupAggDb { user_id: number; total: string; exact: string; outcome: string; wrong: string; pending: string; }
interface KoAggDb { user_id: number; total: string; exact: string; advance: string; wrong: string; pending: string; points: string; }
interface PickAggDb { user_id: number; total: string; correct: string; wrong: string; pending: string; points: string; champ_pts: string | null; }

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
  const currentUserToken = session?.shareToken ?? null;

  // Play-off pick'em is feature-flagged. While off, the league board is the
  // group-stage-only table — no knockout queries, no All/Groups/Play-off toggle.
  const playoffEnabled = await isFeatureEnabled('playoff_pickem', false);

  const league = await queryOne<LeagueRowDb>(
    `SELECT l.id, l.name, l.owner_user_id, owner.name AS owner_name, l.created_at::text AS created_at
       FROM pickem_league l
       JOIN tipster_user owner ON owner.id = l.owner_user_id
      WHERE l.code = $1`,
    [code],
  );
  if (!league) notFound();

  // League members (the predictors whose tips we rank). Cached under this
  // league's standings tag, busted by recalculateLeagueStandings().
  const members = await cachedQuery<MemberDb>(
    `SELECT m.user_id, u.name AS user_name, u.email AS user_email, u.share_token
       FROM pickem_league_member m
       JOIN tipster_user u ON u.id = m.user_id
      WHERE m.league_id = $1`,
    [league.id],
    [leagueStandingsTag(code)],
  );
  const memberIds = members.map((m) => m.user_id);

  // Per-member point sources, mirroring the global leaderboard aggregates but
  // scoped to this league's members. Group-stage tips always; knockout match
  // tips + top-4 picks only when the play-off feature is live.
  const [groupAgg, groupCountRows] = await Promise.all([
    memberIds.length === 0
      ? Promise.resolve([] as GroupAggDb[])
      : cachedQuery<GroupAggDb>(
          `SELECT user_id,
             COUNT(*)                               AS total,
             COUNT(*) FILTER (WHERE points = 4)      AS exact,
             COUNT(*) FILTER (WHERE points = 1)      AS outcome,
             COUNT(*) FILTER (WHERE points = 0)      AS wrong,
             COUNT(*) FILTER (WHERE points IS NULL)  AS pending
           FROM tip WHERE user_id = ANY($1::int[]) GROUP BY user_id`,
          [memberIds],
          [leagueStandingsTag(code)],
        ),
    cachedQuery<{ total: string; finished: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'FINISHED') AS finished FROM match`,
      [], [LEADERBOARD_TAG],
    ),
  ]);

  const groupTotal = parseInt(groupCountRows[0]?.total ?? '0', 10);
  const groupFinished = parseInt(groupCountRows[0]?.finished ?? '0', 10);
  const groupsComplete = groupTotal > 0 && groupFinished === groupTotal;

  const [koAgg, pickAgg, koFinishedRows] = playoffEnabled && memberIds.length > 0
    ? await Promise.all([
        cachedQuery<KoAggDb>(
          `SELECT kt.user_id,
             COUNT(*)                                                                              AS total,
             COUNT(*) FILTER (WHERE km.status = 'FINISHED' AND kt.home_goals = km.home_goals
                                     AND kt.away_goals = km.away_goals)                            AS exact,
             COUNT(*) FILTER (WHERE km.status = 'FINISHED' AND kt.advance_team_id = km.advancing_team_id) AS advance,
             COUNT(*) FILTER (WHERE kt.points = 0)                                                 AS wrong,
             COUNT(*) FILTER (WHERE kt.points IS NULL)                                             AS pending,
             COALESCE(SUM(kt.points), 0)                                                           AS points
           FROM knockout_tip kt JOIN knockout_match km ON km.match_number = kt.match_number
           WHERE kt.user_id = ANY($1::int[])
           GROUP BY kt.user_id`,
          [memberIds],
          [leagueStandingsTag(code)],
        ),
        cachedQuery<PickAggDb>(
          `SELECT user_id,
             COUNT(*)                                AS total,
             COUNT(*) FILTER (WHERE points > 0)       AS correct,
             COUNT(*) FILTER (WHERE points = 0)       AS wrong,
             COUNT(*) FILTER (WHERE points IS NULL)   AS pending,
             COALESCE(SUM(points), 0)                 AS points,
             MAX(points) FILTER (WHERE slot = 'champion') AS champ_pts
           FROM playoff_pick WHERE user_id = ANY($1::int[]) GROUP BY user_id`,
          [memberIds],
          [leagueStandingsTag(code)],
        ),
        cachedQuery<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM knockout_match WHERE status = 'FINISHED'`,
          [], [LEADERBOARD_TAG],
        ),
      ])
    : [[] as KoAggDb[], [] as PickAggDb[], [] as { cnt: string }[]];

  // Is the current user a member? Query the source of truth directly rather
  // than relying on the cached members list — after a just-completed invite
  // join the cache can still serve a snapshot without the new member.
  const myMembership = myUserId !== null
    ? await queryOne<{ user_id: number }>(
        'SELECT user_id FROM pickem_league_member WHERE league_id = $1 AND user_id = $2',
        [league.id, myUserId],
      )
    : null;
  const isMember = !!myMembership;
  const isOwner = myUserId !== null && league.owner_user_id === myUserId;
  const memberCount = members.length;

  // Disambiguate same-name members. Raw e-mails stay server-side; only the bare
  // name + suffix fragment ship to the client.
  const disambiguated = disambiguateNames(
    members.map((m) => ({ id: m.user_id, share_token: m.share_token, name: m.user_name, email: m.user_email })),
  );

  const groupBy = new Map(groupAgg.map((r) => [r.user_id, r]));
  const koBy = new Map(koAgg.map((r) => [r.user_id, r]));
  const pickBy = new Map(pickAgg.map((r) => [r.user_id, r]));
  const n = (v: string | undefined) => (v ? parseInt(v, 10) : 0);

  function buildRows(kind: LeaderboardView): LeaderboardRow[] {
    return disambiguated
      .map((u) => {
        const g = groupBy.get(u.id);
        const k = koBy.get(u.id);
        const p = pickBy.get(u.id);
        return buildLeaderboardRow(
          { shareToken: u.share_token, userId: u.id, name: u.name, nameSuffix: u.nameSuffix },
          kind,
          g ? { total: n(g.total), exact: n(g.exact), outcome: n(g.outcome), wrong: n(g.wrong), pending: n(g.pending) } : undefined,
          k ? { total: n(k.total), exact: n(k.exact), advance: n(k.advance), wrong: n(k.wrong), pending: n(k.pending), points: n(k.points) } : undefined,
          p ? { total: n(p.total), correct: n(p.correct), wrong: n(p.wrong), pending: n(p.pending), points: n(p.points), champPts: p.champ_pts != null ? parseInt(p.champ_pts, 10) : null } : undefined,
          true, // keep every member visible, even at zero tips
        );
      })
      .filter((r): r is LeaderboardRow => r !== null);
  }

  const allData = buildRows('all');
  const groupsData = buildRows('groups');
  const playoffData = buildRows('playoff');

  // Default to the Play-off view once the first knockout match is decided.
  const playoffStarted = n(koFinishedRows[0]?.cnt) > 0;
  const defaultView: LeaderboardView = playoffStarted ? 'playoff' : 'all';

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

      <CopyInviteButton
        invitePath={`/pickem/leagues/invite/${code}/${createInviteHash(code, league.name)}`}
      />

      {playoffEnabled ? (
        <LeaderboardViews
          all={allData}
          groups={groupsData}
          playoff={playoffData}
          defaultView={defaultView}
          groupsComplete={groupsComplete}
          currentUserToken={currentUserToken}
          currentUserId={myUserId}
          emptyMessage={EMPTY_LEAGUE_MESSAGE}
        />
      ) : (
        <LeaderboardTable
          rows={groupsData}
          currentUserToken={currentUserToken}
          currentUserId={myUserId}
          emptyMessage={EMPTY_LEAGUE_MESSAGE}
        />
      )}
    </main>
  );
}
