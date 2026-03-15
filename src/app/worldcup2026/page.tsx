import { query } from '@/lib/db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { getAllCachedProbsOrCompute } from '@/lib/probability-cache';
import Link from 'next/link';
import GroupOverview from '@/app/components/GroupOverview';
import NewsWidget from '@/app/components/NewsWidget';

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id, name: row.name, shortName: row.short_name,
    countryCode: row.country_code, groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder, externalId: row.external_id ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id, groupId: row.group_id as GroupId, round: row.round,
    homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
    homeGoals: row.home_goals, awayGoals: row.away_goals,
    homeYc: row.home_yc, homeRcDirect: row.home_rc_direct,
    awayYc: row.away_yc, awayRcDirect: row.away_rc_direct,
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

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Who Will Qualify?</h1>
          <p className="subtitle">FIFA World Cup 2026 &mdash; Group Stage Tracker</p>
          <p className="tournament-info">
            48 teams &bull; 12 groups &bull; Canada, Mexico &amp; USA &bull; June 11 &ndash; July 19, 2026
          </p>
        </div>
      </section>

      <main className="container">
        <NewsWidget articles={articles} />
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
        <GroupOverview groups={groups} />
      </main>
    </>
  );
}
