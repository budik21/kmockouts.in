import { query, queryOne } from '@/lib/db';
import { notFound } from 'next/navigation';
import PublicTipsView from '../../components/PublicTipsView';
import AdBanner from '@/app/components/AdBanner';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
}

interface TipRow {
  match_id: number;
  home_goals: number;
  away_goals: number;
  points: number | null;
}

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

export default async function PublicSharePage({ params }: Props) {
  const { token } = await params;

  const user = await queryOne<{ id: number; name: string; tips_public: boolean }>(
    'SELECT id, name, tips_public FROM tipster_user WHERE share_token = $1',
    [token],
  );

  if (!user || !user.tips_public) {
    notFound();
  }

  // Get tips
  const tipRows = await query<TipRow>(
    'SELECT match_id, home_goals, away_goals, points FROM tip WHERE user_id = $1',
    [user.id],
  );

  const tips: Record<number, { homeGoals: number; awayGoals: number; points: number | null }> = {};
  for (const t of tipRows) {
    tips[t.match_id] = { homeGoals: t.home_goals, awayGoals: t.away_goals, points: t.points };
  }

  // Get matches
  const matchRows = await query<MatchRow>(`
    SELECT m.id, m.group_id, m.round, m.home_team_id, m.away_team_id,
      m.home_goals, m.away_goals, m.venue, m.kick_off, m.status,
      ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
      at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc
    FROM match m
    JOIN team ht ON m.home_team_id = ht.id
    JOIN team at2 ON m.away_team_id = at2.id
    ORDER BY m.kick_off, m.group_id, m.id
  `);

  const matches = matchRows.map((r) => ({
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

  // Scoring stats
  let exact = 0, outcome = 0, wrong = 0;
  for (const t of Object.values(tips)) {
    if (t.points === 4) exact++;
    else if (t.points === 1) outcome++;
    else if (t.points === 0) wrong++;
  }
  const totalPoints = exact * 4 + outcome;

  return (
    <div className="container py-4">
      <div className="tipovacka-public-header">
        <h2>Predictions by {user.name}</h2>
        <div className="tipovacka-score-cards tipovacka-score-cards-sm">
          <div className="tipovacka-score-card tipovacka-score-total">
            <div className="tipovacka-score-card-value">{totalPoints}</div>
            <div className="tipovacka-score-card-label">Points</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-exact">
            <div className="tipovacka-score-card-value">{exact}</div>
            <div className="tipovacka-score-card-label">Exact</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-outcome">
            <div className="tipovacka-score-card-value">{outcome}</div>
            <div className="tipovacka-score-card-label">+1</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-wrong">
            <div className="tipovacka-score-card-value">{wrong}</div>
            <div className="tipovacka-score-card-label">Wrong</div>
          </div>
        </div>
      </div>

      <AdBanner slot="predictions-share" />

      <PublicTipsView matches={matches} tips={tips} />
    </div>
  );
}
