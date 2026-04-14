import { query, queryOne } from '@/lib/db';
import Link from 'next/link';
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

  // User not found or sharing revoked — show friendly message
  if (!user || !user.tips_public) {
    return (
      <div className="container">
        <div className="tipovacka-revoked">
          <div className="tipovacka-revoked-icon">&#128584;</div>
          <h2>Predictions Unavailable</h2>
          <p>
            {user
              ? 'This user has set their predictions to private. Maybe they\'re still working on their hot takes!'
              : 'This sharing link doesn\'t exist. It might have been a typo, or the crystal ball broke.'}
          </p>
          <Link href="/worldcup2026" className="tipovacka-revoked-link">
            Go to World Cup 2026
          </Link>
        </div>
      </div>
    );
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

  // Match progress
  const totalMatches = matches.length;
  const playedMatches = matches.filter((m) => m.status === 'FINISHED').length;
  const scored = exact + outcome + wrong;
  const pct = (n: number) => scored > 0 ? Math.round((n / scored) * 100) : 0;

  // User first name for title
  const firstName = user.name.split(' ')[0];

  return (
    <div className="container py-4">
      <div className="tipovacka-public-header">
        <h2>World Cup Predictions by {user.name}</h2>
        <div className="tipovacka-score-cards tipovacka-score-cards-wide">
          <div className="tipovacka-score-card tipovacka-score-matches">
            <div className="tipovacka-score-card-value">{totalMatches}</div>
            <div className="tipovacka-score-card-label">Matches total</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-exact">
            <div className="tipovacka-score-card-value">{exact}</div>
            <div className="tipovacka-score-card-pct">{pct(exact)}%</div>
            <div className="tipovacka-score-card-label">Exact Score</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-outcome">
            <div className="tipovacka-score-card-value">{outcome}</div>
            <div className="tipovacka-score-card-pct">{pct(outcome)}%</div>
            <div className="tipovacka-score-card-label">Result Match</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-wrong">
            <div className="tipovacka-score-card-value">{wrong}</div>
            <div className="tipovacka-score-card-pct">{pct(wrong)}%</div>
            <div className="tipovacka-score-card-label">Wrong</div>
          </div>
          <div className="tipovacka-score-card tipovacka-score-points">
            <div className="tipovacka-score-card-value">{totalPoints}</div>
            <div className="tipovacka-score-card-label">Points</div>
          </div>
        </div>
        <div className="tipovacka-match-progress">
          <div className="tipovacka-match-progress-label">
            {playedMatches} / {totalMatches} matches played
          </div>
          <div className="tipovacka-match-progress-bar">
            <div
              className="tipovacka-match-progress-fill"
              style={{ width: `${totalMatches ? (playedMatches / totalMatches) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <PublicTipsView matches={matches} tips={tips} userName={firstName} shareToken={token} />

      <AdBanner slot="predictions-share" />
    </div>
  );
}
