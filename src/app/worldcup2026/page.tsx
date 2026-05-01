import { cachedQuery } from '@/lib/cached-db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { compareThirdPlaced } from '@/engine/best-third';
import { getAllCachedProbsOrCompute } from '@/lib/probability-cache';
import { getCachedQualificationThreshold } from '@/engine/probability';
import Link from 'next/link';
import type { Metadata } from 'next';
import GroupOverview, { GroupArticleSummary } from '@/app/components/GroupOverview';
import BestThirdTable from '@/app/components/BestThirdTable';
import QualificationThresholdBox from '@/app/components/QualificationThreshold';
import NewsWidget from '@/app/components/NewsWidget';
import Countdown from '@/app/components/Countdown';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

interface ScheduledMatchRow {
  id: number;
  kick_off: string;
  venue: string;
  home_name: string;
  home_short: string;
  home_cc: string;
  away_name: string;
  away_short: string;
  away_cc: string;
}

function formatMatchDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${date}, ${time} UTC`;
}

function formatMatchCountdown(iso: string, nowMs: number): string {
  const diff = new Date(iso).getTime() - nowMs;
  if (diff <= 0) return '';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

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

// Opt out of build-time static prerendering. Without this, Next.js renders
// the page during `next build` using whatever match/standings data exists
// then (often empty) and serves that stale HTML after deploy until a
// `revalidateTag(WC_TAG)` fires. The underlying queries still use
// tag-based `unstable_cache`, so per-request DB load is unchanged.
export const dynamic = 'force-dynamic';

// Tag-based on-demand revalidation: this page is cached indefinitely
// and invalidated via `revalidateTag(WC_TAG)` in admin mutation endpoints
// (src/app/api/admin/match/update, src/app/api/scenarios/apply).

export const metadata: Metadata = {
  title: 'FIFA World Cup 2026 Bracket, Standings & Knockout Tracker',
  description:
    'Follow every group, fixture and knockout play-off match of the FIFA World Cup 2026. Live standings, FIFA ranking and qualification probabilities for all 48 soccer teams in Canada, Mexico and USA.',
  alternates: { canonical: '/worldcup2026' },
  openGraph: {
    title: 'FIFA World Cup 2026 Bracket, Standings & Knockout Tracker',
    description:
      'Live group standings, knockout bracket, FIFA ranking and play-off probabilities for the FIFA World Cup 2026.',
    url: `${SITE_URL}/worldcup2026`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FIFA World Cup 2026 Bracket, Standings & Knockout Tracker',
    description:
      'Live group standings, knockout bracket and play-off probabilities for the FIFA World Cup 2026.',
  },
};

interface ThirdPlacedTeam {
  rank: number;
  groupId: string;
  team: { id: number; name: string; shortName: string; countryCode: string; isPlaceholder: boolean };
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  fairPlayPoints: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildGroupsData(): Promise<{ groups: Record<string, any>; thirdPlacedTeams: ThirdPlacedTeam[]; allTeamsPlayedTwo: boolean; hasRemainingMatches: boolean }> {
  const groups: Record<string, unknown> = {};
  const thirdPlaced: { groupId: GroupId; standing: ReturnType<typeof calculateStandings>[number] }[] = [];
  let allTeamsPlayedTwo = true;
  let hasRemainingMatches = false;

  // Read cached probabilities (computes any missing groups on first load)
  const cachedProbs = await getAllCachedProbsOrCompute();

  for (const gid of ALL_GROUPS) {
    const teamRows = await cachedQuery<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const matchRows = await cachedQuery<MatchRow>("SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round", [gid]);
    const allMatchRows = await cachedQuery<MatchRow>('SELECT * FROM match WHERE group_id = $1', [gid]);
    const scheduledRows = await cachedQuery<ScheduledMatchRow>(
      `SELECT m.id, m.kick_off, m.venue,
              ht.name AS home_name, ht.short_name AS home_short, ht.country_code AS home_cc,
              at2.name AS away_name, at2.short_name AS away_short, at2.country_code AS away_cc
         FROM match m
         JOIN team ht ON m.home_team_id = ht.id
         JOIN team at2 ON m.away_team_id = at2.id
        WHERE m.group_id = $1 AND m.status = 'SCHEDULED'
        ORDER BY m.kick_off ASC`,
      [gid],
    );
    const teams = teamRows.map(rowToTeam);
    const matches = matchRows.map(rowToMatch);
    const standings = calculateStandings({ teams, matches });

    if (allMatchRows.length > matchRows.length) {
      hasRemainingMatches = true;
    }
    if (allTeamsPlayedTwo) {
      for (const t of teams) {
        const teamMatchCount = matches.filter(m => m.homeTeamId === t.id || m.awayTeamId === t.id).length;
        if (teamMatchCount < 2) {
          allTeamsPlayedTwo = false;
          break;
        }
      }
    }

    // Collect third-placed team
    const third = standings.find((s) => s.position === 3);
    if (third) {
      thirdPlaced.push({ groupId: gid, standing: third });
    }

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
      finishedMatches: matchRows.length,
      totalMatches: allMatchRows.length,
      standings: standings.map((s) => ({
        position: s.position,
        team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder, fifaRanking: s.team.fifaRanking },
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
      nextMatches: (() => {
        const nowMs = Date.now();
        const upcoming = scheduledRows.filter((r) => new Date(r.kick_off).getTime() > nowMs);
        if (upcoming.length === 0) return [];
        const minKickOff = upcoming.reduce(
          (min, r) => Math.min(min, new Date(r.kick_off).getTime()),
          Number.POSITIVE_INFINITY,
        );
        return upcoming
          .filter((r) => new Date(r.kick_off).getTime() === minKickOff)
          .map((r) => ({
            id: r.id,
            homeShort: r.home_short,
            homeCc: r.home_cc,
            awayShort: r.away_short,
            awayCc: r.away_cc,
            venue: r.venue,
            dateTimeText: formatMatchDateTime(r.kick_off),
            countdownText: formatMatchCountdown(r.kick_off, nowMs),
          }));
      })(),
    };
  }

  // Sort third-placed teams by FIFA criteria
  thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

  const thirdPlacedTeams = thirdPlaced.map((tp, i) => ({
    rank: i + 1,
    groupId: tp.groupId,
    team: {
      id: tp.standing.team.id,
      name: tp.standing.team.name,
      shortName: tp.standing.team.shortName,
      countryCode: tp.standing.team.countryCode,
      isPlaceholder: tp.standing.team.isPlaceholder,
      fifaRanking: tp.standing.team.fifaRanking,
    },
    matchesPlayed: tp.standing.matchesPlayed,
    wins: tp.standing.wins,
    draws: tp.standing.draws,
    losses: tp.standing.losses,
    goalsFor: tp.standing.goalsFor,
    goalsAgainst: tp.standing.goalsAgainst,
    goalDifference: tp.standing.goalDifference,
    points: tp.standing.points,
    fairPlayPoints: tp.standing.fairPlayPoints,
  }));

  return { groups, thirdPlacedTeams, allTeamsPlayedTwo, hasRemainingMatches };
}

interface NewsRow {
  id: number;
  external_url: string;
  title: string;
  image_url: string;
  published_at: string | null;
}

async function getGroupArticles(): Promise<Record<string, GroupArticleSummary>> {
  try {
    const rows = await cachedQuery<{ group_id: string; headline: string; lede: string; body_html: string }>(
      'SELECT group_id, headline, lede, body_html FROM ai_group_article_cache',
    );
    const out: Record<string, GroupArticleSummary> = {};
    for (const r of rows) {
      out[r.group_id] = { headline: r.headline, lede: r.lede, body_html: r.body_html };
    }
    return out;
  } catch {
    // Cache table might not exist yet
    return {};
  }
}

async function getNewsArticles() {
  try {
    const rows = await cachedQuery<NewsRow>(
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
  const [{ groups, thirdPlacedTeams, allTeamsPlayedTwo, hasRemainingMatches }, articles, groupArticles] = await Promise.all([
    buildGroupsData(),
    getNewsArticles(),
    getGroupArticles(),
  ]);

  // Load qualification threshold when conditions are met
  let qualificationThreshold: import('@/engine/best-third').QualificationThreshold | null = null;
  if (allTeamsPlayedTwo && hasRemainingMatches) {
    try {
      qualificationThreshold = await getCachedQualificationThreshold();
    } catch {
      // Table might not exist yet
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const hasMatchesPlayed = Object.values(groups).some((g: any) =>
    g.standings.some((s: any) => s.matchesPlayed > 0)
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // BreadcrumbList + FAQPage structured data for the homepage.
  const homeJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${SITE_URL}/worldcup2026`,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How many soccer teams play at the FIFA World Cup 2026?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '48 national teams play at the FIFA World Cup 2026, divided into 12 groups of 4. The top two teams from each group plus the eight best third-placed teams advance to the Round of 32.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does the FIFA World Cup 2026 knockout bracket work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The knockout phase starts with a Round of 32 and continues through the Round of 16, Quarterfinals, Semifinals and Final. Every match is single elimination — losers are out, winners advance to the next round.',
          },
        },
        {
          '@type': 'Question',
          name: 'How are the best third-placed teams chosen for the play-off?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'After the group stage, the 12 third-placed teams are ranked by points, goal difference, goals scored, fair play points and FIFA ranking. The top 8 advance to the knockout Round of 32.',
          },
        },
        {
          '@type': 'Question',
          name: 'Where is the FIFA World Cup 2026 played?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The FIFA World Cup 2026 is jointly hosted by Canada, Mexico and the United States, with matches played in 16 host cities across the three countries.',
          },
        },
      ],
    },
  ];

  return (
    <>
      <JsonLd data={homeJsonLd} />
      <section className="hero">
        <div className="container">
          <h1>Who Clinches a World Cup Play-Off?</h1>
          <p className="subtitle">Be the first to know who qualifies for the FIFA World Cup knockout phase. Even before it happens.</p>
          <Countdown
            startedFallback={
              <Link href="/worldcup2026/fixtures" className="hero-fixtures-btn">
                📅 Fixtures &amp; Results
              </Link>
            }
          />
          <Link href="/worldcup2026/how-to-clinch-play-off-worldcup2026" className="hero-clinch-link">
            How to Clinch a Play-Off Spot &rarr;
          </Link>
          <Link href="/pickem" className="hero-pickem-btn">
            🏆 Play Pick&apos;em — predict all 48 matches
          </Link>
        </div>
      </section>

      <main className="container">
        <NewsWidget articles={articles} />
        <GroupOverview groups={groups} articles={groupArticles} />

        {hasMatchesPlayed && (
          <div className="mt-3">
            <Link href="/worldcup2026/best-third-placed" style={{ textDecoration: 'none' }}>
              <div className="group-card">
                <div className="group-card-header">
                  <span>Best Third-Placed Teams</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                    8 of 12 qualify for Round of 32
                  </span>
                </div>
                <div className="group-card-body">
                  <BestThirdTable teams={thirdPlacedTeams} />
                </div>
              </div>
            </Link>
            {qualificationThreshold && (
              <QualificationThresholdBox threshold={qualificationThreshold} />
            )}
          </div>
        )}

        {/* Methodology + SEO content block — explains how the site works,
            what makes the data trustworthy and where to go next. Doubles as
            keyword-rich content for search and AdSense reviewers. */}
        <section className="mt-5" aria-label="About Knockouts.in">
          <h2 className="h4 mb-3">Your FIFA World Cup 2026 Knockout &amp; Play-Off Tracker</h2>
          <p className="text-muted">
            Knockouts.in is the fastest way to follow the <strong>FIFA World Cup 2026</strong> in
            Canada, Mexico and the United States. We track every soccer match in all 12 groups,
            compute live standings, simulate every remaining fixture and tell you exactly who is
            on course for the <strong>knockout bracket</strong> and the eight best-third{' '}
            <strong>play-off</strong> spots.
          </p>

          <h3 className="h5 mt-4 mb-2">How the probabilities are calculated</h3>
          <p className="text-muted">
            After every match result, our engine enumerates every remaining outcome combination in
            each group and computes the final standings using FIFA&apos;s full tie-breaker chain —
            points, head-to-head, goal difference, goals scored, fair-play points and FIFA ranking.
            The numbers on every group page are exact qualification probabilities, not Monte Carlo
            estimates. Once the engine finishes, an AI language model (Anthropic&apos;s Claude) turns
            those raw scenarios into a short, plain-English analysis on each group page so you can
            read what the data says, not just stare at percentages.
          </p>

          <h3 className="h5 mt-4 mb-2">Manually verified results</h3>
          <p className="text-muted">
            Every score, yellow card and red card on this site is entered by hand — there is no
            automated scraper. That&apos;s how we keep the data honest, and why the AI analysis
            updates within minutes of every match ending. If something looks wrong, email{' '}
            <a href="mailto:support@knockouts.in">support@knockouts.in</a> and I&apos;ll fix it.
            Curious about the person behind the site? See the <Link href="/about">About</Link> page.
          </p>

          <h3 className="h5 mt-4 mb-2">Explore the tournament</h3>
          <p className="text-muted">
            Explore the interactive <Link href="/worldcup2026/knockout-bracket">knockout bracket</Link>,
            check the latest <Link href="/worldcup2026/fifa-ranking">FIFA ranking</Link>, browse the
            full <Link href="/worldcup2026/fixtures">fixtures &amp; results</Link>, see the current{' '}
            <Link href="/worldcup2026/best-third-placed">best third-placed teams</Link>, or learn{' '}
            <Link href="/worldcup2026/how-to-clinch-play-off-worldcup2026">how to clinch a play-off spot</Link>.
            Every group page shows live standings and the exact scenarios each team needs to
            qualify for the knockout stage.
          </p>
        </section>

        <div className="paypal-donate-section">
          <p className="paypal-donate-heading">Support us</p>
          <p className="paypal-donate-text">
            Knockouts.in is free to use.<br />
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
