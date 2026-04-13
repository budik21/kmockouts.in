import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import PredictionsApp from '../components/PredictionsApp';

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
  away_name: string;
  away_short: string;
  away_cc: string;
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
  homeTeam: { name: string; shortName: string; countryCode: string };
  awayTeam: { name: string; shortName: string; countryCode: string };
}

export default async function TipsPage() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.tipsterId) {
    redirect('/predictions');
  }

  const rows = await query<MatchRow>(`
    SELECT m.id, m.group_id, m.round, m.home_team_id, m.away_team_id,
      m.home_goals, m.away_goals, m.venue, m.kick_off, m.status,
      ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
      at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc
    FROM match m
    JOIN team ht ON m.home_team_id = ht.id
    JOIN team at2 ON m.away_team_id = at2.id
    ORDER BY m.kick_off, m.group_id, m.id
  `);

  // Check if user has any tips already (returning user vs new user)
  const tipCountRow = await queryOne<{ cnt: string }>(
    'SELECT COUNT(*) as cnt FROM tip WHERE user_id = $1',
    [session.tipsterId],
  );
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
    homeTeam: { name: r.home_name, shortName: r.home_short, countryCode: r.home_cc },
    awayTeam: { name: r.away_name, shortName: r.away_short, countryCode: r.away_cc },
  }));

  return (
    <PredictionsApp
      matches={matches}
      userName={session.user?.name || ''}
      shareToken={session.shareToken || ''}
      tipsPublic={session.tipsPublic || false}
      isReturningUser={hasTips}
    />
  );
}
