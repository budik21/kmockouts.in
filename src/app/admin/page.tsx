import { query } from '@/lib/db';
import MatchEditor from './components/MatchEditor';

interface AdminMatchRow {
  id: number;
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number | null;
  away_goals: number | null;
  home_yc: number;
  home_yc2: number;
  home_rc_direct: number;
  away_yc: number;
  away_yc2: number;
  away_rc_direct: number;
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

export interface AdminMatch {
  id: number;
  groupId: string;
  round: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  venue: string;
  kickOff: string;
  status: string;
  homeTeam: { name: string; shortName: string; countryCode: string };
  awayTeam: { name: string; shortName: string; countryCode: string };
}

export default async function AdminPage() {
  const rows = await query<AdminMatchRow>(`
    SELECT m.*,
      ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
      at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc
    FROM match m
    JOIN team ht ON m.home_team_id = ht.id
    JOIN team at2 ON m.away_team_id = at2.id
    ORDER BY m.kick_off, m.group_id, m.id
  `);

  const matches: AdminMatch[] = rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    round: r.round,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    homeYc: r.home_yc,
    homeYc2: r.home_yc2,
    homeRcDirect: r.home_rc_direct,
    awayYc: r.away_yc,
    awayYc2: r.away_yc2,
    awayRcDirect: r.away_rc_direct,
    venue: r.venue,
    kickOff: r.kick_off,
    status: r.status,
    homeTeam: { name: r.home_name, shortName: r.home_short, countryCode: r.home_cc },
    awayTeam: { name: r.away_name, shortName: r.away_short, countryCode: r.away_cc },
  }));

  return (
    <div className="container py-3">
      <h1 className="mb-3" style={{ color: 'var(--wc-text)', fontSize: '1.5rem' }}>
        Match Administration
      </h1>
      <MatchEditor initialMatches={matches} />
    </div>
  );
}
