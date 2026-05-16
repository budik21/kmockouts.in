import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { createInviteHash } from '@/lib/league-hash';
import PredictionsApp from '../components/PredictionsApp';
import type { LeagueListItem } from '../leagues/LeaguesView';

export const dynamic = 'force-dynamic';

interface MatchRow {
  id: number;
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number | null;
  away_goals: number | null;
  venue: string;
  kick_off: string;
  status: string;
  home_name: string;
  home_short: string;
  home_cc: string;
  home_fifa: number | null;
  away_name: string;
  away_short: string;
  away_cc: string;
  away_fifa: number | null;
}

export interface TipMatch {
  id: number;
  groupId: string;
  round: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string;
  kickOff: string;
  status: string;
  homeTeam: { name: string; shortName: string; countryCode: string; fifaRanking: number | null };
  awayTeam: { name: string; shortName: string; countryCode: string; fifaRanking: number | null };
}

interface OwnedLeagueRow {
  code: string;
  name: string;
  member_count: string;
  created_at: string;
}

interface MemberLeagueRow {
  code: string;
  name: string;
  member_count: string;
  owner_name: string;
  joined_at: string;
}

interface NotifyPrefsRow {
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
}

type Tab = 'dashboard' | 'predictions' | 'groups' | 'leagues' | 'settings';
const VALID_TABS: Tab[] = ['dashboard', 'predictions', 'groups', 'leagues', 'settings'];

export default async function TipsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.tipsterId) {
    redirect('/pickem');
  }

  const sp = (await searchParams) ?? {};
  const initialTab: Tab | undefined = VALID_TABS.includes(sp.tab as Tab)
    ? (sp.tab as Tab)
    : undefined;

  const myUserId = session.tipsterId;

  const [rows, tipCountRow, ownedRows, memberRows, notifyRow] = await Promise.all([
    query<MatchRow>(`
      SELECT m.id, m.group_id, m.round, m.home_team_id, m.away_team_id,
        m.home_goals, m.away_goals, m.venue, m.kick_off, m.status,
        ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
        ht.fifa_ranking as home_fifa,
        at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc,
        at2.fifa_ranking as away_fifa
      FROM match m
      JOIN team ht ON m.home_team_id = ht.id
      JOIN team at2 ON m.away_team_id = at2.id
      ORDER BY m.kick_off, m.group_id, m.id
    `),
    queryOne<{ cnt: string }>(
      'SELECT COUNT(*) as cnt FROM tip WHERE user_id = $1',
      [myUserId],
    ),
    query<OwnedLeagueRow>(
      `SELECT l.code, l.name,
              (SELECT COUNT(*) FROM pickem_league_member m WHERE m.league_id = l.id)::text AS member_count,
              l.created_at::text AS created_at
         FROM pickem_league l
        WHERE l.owner_user_id = $1
        ORDER BY l.created_at DESC`,
      [myUserId],
    ),
    query<MemberLeagueRow>(
      `SELECT l.code, l.name,
              (SELECT COUNT(*) FROM pickem_league_member m2 WHERE m2.league_id = l.id)::text AS member_count,
              owner.name AS owner_name,
              m.joined_at::text AS joined_at
         FROM pickem_league_member m
         JOIN pickem_league l ON l.id = m.league_id
         JOIN tipster_user owner ON owner.id = l.owner_user_id
        WHERE m.user_id = $1
        ORDER BY m.joined_at DESC`,
      [myUserId],
    ),
    queryOne<NotifyPrefsRow>(
      'SELECT notify_exact_score, notify_winner_only, notify_wrong_tip FROM tipster_user WHERE id = $1',
      [myUserId],
    ),
  ]);

  const hasTips = parseInt(tipCountRow?.cnt || '0') > 0;

  const matches: TipMatch[] = rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    round: r.round,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    venue: r.venue,
    kickOff: r.kick_off,
    status: r.status,
    homeTeam: { name: r.home_name, shortName: r.home_short, countryCode: r.home_cc, fifaRanking: r.home_fifa },
    awayTeam: { name: r.away_name, shortName: r.away_short, countryCode: r.away_cc, fifaRanking: r.away_fifa },
  }));

  const myLeagues: LeagueListItem[] = ownedRows.map((r) => ({
    code: r.code,
    name: r.name,
    memberCount: parseInt(r.member_count, 10),
    inviteHash: createInviteHash(r.code, r.name),
    isOwner: true,
  }));

  const participatingLeagues: LeagueListItem[] = memberRows.map((r) => ({
    code: r.code,
    name: r.name,
    memberCount: parseInt(r.member_count, 10),
    ownerName: r.owner_name,
    isOwner: false,
  }));

  const initialNotify = {
    exactScore: !!notifyRow?.notify_exact_score,
    winnerOnly: !!notifyRow?.notify_winner_only,
    wrongTip: !!notifyRow?.notify_wrong_tip,
  };

  return (
    <PredictionsApp
      matches={matches}
      userName={session.user?.name || ''}
      shareToken={session.shareToken || ''}
      tipsPublic={session.tipsPublic || false}
      isReturningUser={hasTips}
      myLeagues={myLeagues}
      participatingLeagues={participatingLeagues}
      isAdmin={!!session.isAdmin}
      initialTab={initialTab}
      initialNotify={initialNotify}
    />
  );
}
