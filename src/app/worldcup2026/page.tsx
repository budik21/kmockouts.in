import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { getAllCachedProbsOrCompute } from '@/lib/probability-cache';
import Link from 'next/link';
import GroupOverview from '@/app/components/GroupOverview';
import NewsWidget from '@/app/components/NewsWidget';
import Countdown from '@/app/components/Countdown';

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id, name: row.name, shortName: row.short_name,
    countryCode: row.country_code, groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder, externalId: row.external_id ?? undefined,
    fifaRanking: row.fifa_ranking ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id, groupId: row.group_id as GroupId, round: row.round,
    homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
    homeGoals: row.home_goals, awayGoals: row.away_goals,
    homeYc: row.home_yc, homeYc2: row.home_yc2, homeRcDirect: row.home_rc_direct, homeYcRc: row.home_yc_rc,
    awayYc: row.away_yc, awayYc2: row.away_yc2, awayRcDirect: row.away_rc_direct, awayYcRc: row.away_yc_rc,
    venue: row.venue, kickOff: row.kick_off, status: row.status as Match['status'],
  };
}

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildGroupsData(): Promise<Record<string, any>> {
  const groups: Record<string, unknown> = {};

  // Read cached probabilities (computes any missing groups on first load)
  const cachedProbs = await getAllCachedProbsOrCompute();

  for (const gid of ALL_GROUPS) {
    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const matchRows = await query<MatchRow>("SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round", [gid]);
    const teams = teamRows.map(rowToTeam);
    const matches = matchRows.map(rowToMatch);
    const standings = calculateStandings({ teams, matches });

    // Build probability map for this group from cache
    const groupCache = cachedProbs.get(gid);
    let probabilities: Record<number, { probFirst: number; probSecond: number; probThird: number; probOut: number }> | undefined;
    if (groupCache && groupCache.size > 0) {
      probabilities = {};
      for (const [teamId, cp] of groupCache) {
        probabilities[teamId] = {
          probFirst: cp.probFirst,
          probSecond: cp.probSecond,
          probThird: cp.probThird,
          probOut: cp.probOut,
        };
      }
    }

    groups[gid] = {
      groupId: gid,
      standings: standings.map((s) => ({
        position: s.position,
        team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder },
        matchesPlayed: s.matchesPlayed,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: s.goalDifference,
        points: s.points,
      })),
      probabilities,
    };
  }

  return groups;
}

interface NewsRow {
  id: number;
  external_url: string;
  title: string;
  image_url: string;
  published_at: string | null;
}

async function getNewsArticles() {
  try {
    const rows = await query<NewsRow>(
      'SELECT id, external_url, title, image_url, published_at FROM news_article ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 10'
    );
    return rows.map((r) => ({
      title: r.title,
      url: r.external_url,
      imageUrl: r.image_url,
      publishedAt: r.published_at,
    }));
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [groups, articles] = await Promise.all([buildGroupsData(), getNewsArticles()]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasMatchesPlayed = Object.values(groups).some((g: any) =>
    g.standings.some((s: any) => s.matchesPlayed > 0)
  );

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Who Clinches a World Cup Play-Off?</h1>
          <p className="subtitle">Be the first to know who qualifies for the FIFA World Cup knockout phase</p>
          <Countdown />
          <Link href="/worldcup2026/how-to-clinch-play-off-worldcup2026" className="hero-clinch-link">
            How to Clinch a Play-Off Spot &rarr;
          </Link>
        </div>
      </section>

      <main className="container">
        <NewsWidget articles={articles} />
        {hasMatchesPlayed && (
          <Link href="/worldcup2026/best-third-placed" className="best-third-banner mb-3 d-block">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <strong>Best Third-Placed Teams</strong>
                <span className="d-none d-sm-inline text-muted ms-2">
                  &mdash; 8 of 12 third-placed teams qualify for Round of 32
                </span>
              </div>
              <span className="best-third-banner-arrow">&rarr;</span>
            </div>
          </Link>
        )}
        <GroupOverview groups={groups} />

        <div className="paypal-donate-section">
          <p className="paypal-donate-heading">Support us</p>
          <p className="paypal-donate-text">
            Knockouts.in is provided without fees and ads.<br />
            If you like it, drop a buck via PayPal.
          </p>
          <form action="https://www.paypal.com/donate" method="post" target="_blank">
            <input type="hidden" name="hosted_button_id" value="KL6HYXE53XDTG" />
            <button type="submit" className="paypal-donate-button" title="Donate with PayPal">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ marginRight: 6, verticalAlign: '-2px' }}>
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.56c-.525 0-.963.38-1.045.9l-1.44 7.106zm7.834-15.33c-.193 0-.378.15-.41.348l-.478 2.453c-.032.197.098.348.29.348h.598c1.43 0 2.683-.29 3.227-1.852.2-.574.235-1.058.065-1.39-.2-.39-.728-.606-1.56-.606h-1.732z" />
              </svg>
              Donate with PayPal
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
