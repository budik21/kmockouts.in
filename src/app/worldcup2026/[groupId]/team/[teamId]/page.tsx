import { cachedQuery } from '@/lib/cached-db';
import { ALL_GROUPS } from '@/lib/constants';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { enumerateGroupScenarios } from '@/engine/scenarios';
import { getCachedGroupProbs, recalculateGroupProbabilities } from '@/lib/probability-cache';
import { compareThirdPlaced } from '@/engine/best-third';
import { generateScenarioSummaries } from '@/engine/scenario-summary';
import { getCachedAiScenarioSummaries } from '@/engine/scenario-summary-ai';
import { getCachedTeamArticle } from '@/engine/team-article-ai';
import { isFeatureEnabled } from '@/lib/feature-flags';
import CollapsibleArticleBody from '@/app/components/CollapsibleArticleBody';
import { autoLinkTeams } from '@/lib/auto-link-teams';
import Link from 'next/link';
import type { Metadata } from 'next';
import { slugify } from '@/lib/slugify';
import TeamFlag from '@/app/components/TeamFlag';
import QualifyWidgets from '@/app/components/QualifyWidgets';
import TeamScenarioView from '@/app/components/TeamScenarioView';
import MatchList from '@/app/components/MatchList';
import NextMatchDate from '@/app/components/NextMatchDate';
import ProjectedOpponent from '@/app/components/ProjectedOpponent';
import { resolveKnockoutBracket } from '@/engine/knockout-resolver';
import { ROUND_LABELS } from '@/lib/knockout-bracket';
import AdBanner from '@/app/components/AdBanner';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

const AD_SLOT_TEAM_PAGE = 'XXXXXXXXXX';  // TODO: replace with real slot ID

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

/** Extract group letter from slug like "group-a" → "A" */
function parseGroupSlug(slug: string): GroupId | null {
  const match = slug.match(/^group-([a-l])$/i);
  if (!match) return null;
  const groupId = match[1].toUpperCase() as GroupId;
  return ALL_GROUPS.includes(groupId) ? groupId : null;
}

// Dynamic params without a `generateStaticParams` list → no build-time
// prerendering of the 48 team pages. The first request after a cache
// invalidation renders the page and the result is stored in the Full
// Route Cache (including the expensive scenario enumeration + AI
// summaries); subsequent requests are served straight from cache until
// `revalidateTag(WC_TAG)` fires (e.g. after an admin match update). The
// admin endpoint additionally warms every team URL in the affected group
// so even the "first" visitor gets a cache hit. See cache-tags.ts.

interface PageProps {
  params: Promise<{ groupId: string; teamId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { groupId: slug, teamId: rawTeamId } = await params;
  const groupId = parseGroupSlug(slug);
  if (!groupId) return { title: 'Team not found' };
  const rows = await cachedQuery<TeamRow>('SELECT * FROM team WHERE group_id = $1', [groupId]);
  const team = rows.find((r) => slugify(r.name) === rawTeamId.toLowerCase());
  if (!team) return { title: 'Team not found' };

  const canonical = `/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(team.name)}`;

  // Prefer the cached AI team article for title + description when present:
  // it is written for the current state of the group and reads like real
  // editorial copy in search results.
  const article = await getCachedTeamArticle(team.id);

  const title = article
    ? `${article.headline} — ${team.name}, Group ${groupId} | FIFA World Cup 2026`
    : `${team.name} at the FIFA World Cup 2026 — Group ${groupId} Standings, Fixtures & Knockout Scenarios`;
  const description = article
    ? article.lede
    : `Track ${team.name}'s FIFA World Cup 2026 journey in Group ${groupId}: live standings, fixtures, FIFA ranking, knockout play-off probability and every scenario for advancing to the Round of 32.`;

  return {
    title,
    description,
    keywords: [
      `${team.name} World Cup 2026`,
      `${team.name} FIFA ranking`,
      `${team.name} fixtures`,
      `${team.name} knockout`,
      `${team.name} play-off`,
      `Group ${groupId}`,
      'FIFA World Cup 2026',
      'soccer',
      'football',
    ],
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonical}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { groupId: slug, teamId: rawTeamId } = await params;
  const groupId = parseGroupSlug(slug);

  if (!groupId) {
    return <main className="container py-4"><h2>Group not found</h2></main>;
  }

  const teamRows = await cachedQuery<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);
  const matchRows = await cachedQuery<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

  const teams = teamRows.map(rowToTeam);
  const allMatches = matchRows.map(rowToMatch);
  const played = allMatches.filter((m) => m.status === 'FINISHED');
  const remaining = allMatches.filter((m) => m.status !== 'FINISHED');

  const team = teams.find((t) => slugify(t.name) === rawTeamId.toLowerCase());
  if (!team) {
    return <main className="container py-4"><h2>Team not found</h2></main>;
  }

  const teamMap = new Map(teams.map((t) => [t.id, { id: t.id, name: t.name, shortName: t.shortName, countryCode: t.countryCode, fifaRanking: t.fifaRanking }]));

  // Has this team played at least one match?
  const teamHasPlayed = played.some((m) => m.homeTeamId === team.id || m.awayTeamId === team.id);

  // Calculate standings
  const standings = calculateStandings({ teams, matches: played });
  const standingsForDisplay = standings.map((s) => ({
    ...s,
    team: { id: s.team.id, name: s.team.name, shortName: s.team.shortName, countryCode: s.team.countryCode, isPlaceholder: s.team.isPlaceholder, fifaRanking: s.team.fifaRanking },
  }));

  // Calculate scenarios
  const summaries = enumerateGroupScenarios(teams, played, remaining);
  const teamSummary = summaries.find((s) => s.teamId === team.id)!;

  const probs = teamSummary.positionProbabilities;
  const qualifyProb = (probs[1] ?? 0) + (probs[2] ?? 0) + (probs[3] ?? 0);
  const eliminateProb = probs[4] ?? 0;

  // Read cached probabilities for the standings table
  let cachedProbs = await getCachedGroupProbs(groupId);
  if (!cachedProbs) {
    await recalculateGroupProbabilities(groupId);
    cachedProbs = await getCachedGroupProbs(groupId);
  }
  let probabilities: Record<number, { probFirst: number; probSecond: number; probThird: number; probOut: number }> | undefined;
  if (cachedProbs && cachedProbs.size > 0) {
    probabilities = {};
    for (const [tid, cp] of cachedProbs) {
      probabilities[tid] = {
        probFirst: cp.probFirst,
        probSecond: cp.probSecond,
        probThird: cp.probThird,
        probOut: cp.probOut,
      };
    }
  }

  // Compute best-3rd ranking (current snapshot across all groups)
  let bestThirdRank: number | null = null;
  let bestThirdQualifies = false;
  const currentPosition = standings.find((s) => s.team.id === team.id)?.position ?? null;
  const isCurrentlyThird = currentPosition === 3;
  if ((probs[3] ?? 0) > 0 && isCurrentlyThird) {
    const thirdPlaced: { groupId: GroupId; standing: typeof standings[0] }[] = [];
    for (const gid of ALL_GROUPS) {
      if (gid === groupId) {
        const third = standings.find((s) => s.position === 3);
        if (third) thirdPlaced.push({ groupId: gid, standing: third });
      } else {
        const gTeamRows = await cachedQuery<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
        const gMatchRows = await cachedQuery<MatchRow>(
          "SELECT * FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round",
          [gid],
        );
        const gTeams = gTeamRows.map(rowToTeam);
        const gMatches = gMatchRows.map(rowToMatch);
        const gStandings = calculateStandings({ teams: gTeams, matches: gMatches });
        const third = gStandings.find((s) => s.position === 3);
        if (third) thirdPlaced.push({ groupId: gid, standing: third });
      }
    }
    thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));
    const idx = thirdPlaced.findIndex((tp) => tp.groupId === groupId);
    if (idx !== -1) {
      bestThirdRank = idx + 1;
      bestThirdQualifies = bestThirdRank <= 8;
    }
  }

  // Enrich edge scenarios with team names and country codes
  const enrichedEdges: { [pos: number]: { shortKey: string; matchResults: { matchId: number; homeTeamId: number; awayTeamId: number; homeGoals: number; awayGoals: number; label: string; homeTeamName: string; homeTeamShort: string; homeCountryCode: string; awayTeamName: string; awayTeamShort: string; awayCountryCode: string }[] }[] } = {};

  for (let pos = 1; pos <= 4; pos++) {
    enrichedEdges[pos] = (teamSummary.edgeScenariosByPosition[pos] ?? []).map((combo) => ({
      shortKey: combo.shortKey,
      matchResults: combo.matchResults
        .map((mr) => ({
          ...mr,
          homeTeamName: teamMap.get(mr.homeTeamId)?.name ?? '?',
          homeTeamShort: teamMap.get(mr.homeTeamId)?.shortName ?? '?',
          homeCountryCode: teamMap.get(mr.homeTeamId)?.countryCode ?? '',
          awayTeamName: teamMap.get(mr.awayTeamId)?.name ?? '?',
          awayTeamShort: teamMap.get(mr.awayTeamId)?.shortName ?? '?',
          awayCountryCode: teamMap.get(mr.awayTeamId)?.countryCode ?? '',
        }))
        // Team's own match always first
        .sort((a, b) => {
          const aOwn = a.homeTeamId === team.id || a.awayTeamId === team.id;
          const bOwn = b.homeTeamId === team.id || b.awayTeamId === team.id;
          if (aOwn && !bOwn) return -1;
          if (!aOwn && bOwn) return 1;
          return 0;
        }),
    }));
  }

  // Generate scenario summaries (AI-powered with deterministic fallback)
  const remainingMatchesInfo = remaining.map((m, i) => ({
    matchIndex: i,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: teamMap.get(m.homeTeamId)?.name ?? '?',
    awayTeamName: teamMap.get(m.awayTeamId)?.name ?? '?',
  }));
  const deterministicSummaries = generateScenarioSummaries(
    team.id,
    team.name,
    teamSummary.outcomePatternsByPosition,
    remainingMatchesInfo,
    probs,
  );

  let scenarioSummaries = deterministicSummaries;
  // Read AI summaries from cache only — never generate on page view.
  // Fresh generation is triggered exclusively by admin match-update pregeneration.
  // The ai_predictions_display flag hides AI commentary even when cached; off ⇒ use deterministic only.
  const displayAi = await isFeatureEnabled('ai_predictions_display', true);
  const allTeamsPlayed = teams.every(t => played.some(m => m.homeTeamId === t.id || m.awayTeamId === t.id));
  if (displayAi && remaining.length > 0 && allTeamsPlayed) {
    try {
      const currentStandings = standings.map(s => ({
        teamName: s.team.name,
        points: s.points,
        gd: s.goalsFor - s.goalsAgainst,
        position: s.position,
      }));
      const aiSummaries = await getCachedAiScenarioSummaries({
        teamId: team.id,
        teamName: team.name,
        groupId: groupId,
        outcomePatternsByPosition: teamSummary.outcomePatternsByPosition,
        probabilities: probs,
        remainingMatches: remainingMatchesInfo,
        currentStandings,
      });
      // Merge: use AI where cached, fall back to deterministic
      scenarioSummaries = { ...deterministicSummaries };
      for (const pos of [1, 2, 3, 4]) {
        if (aiSummaries[pos]) {
          scenarioSummaries[pos] = aiSummaries[pos];
        }
      }
    } catch (err) {
      console.error('AI scenario cache read failed, using deterministic fallback:', err);
    }
  }

  // Compute projected knockout opponent based on current standings across all groups
  let projectedOpponent: {
    roundLabel: string;
    opponent: { name: string; countryCode: string } | null;
    opponentPlaceholder: string;
    kickOff: string | null;
    venue: string | null;
    matchNumber: number;
  } | null = null;

  if (teamHasPlayed) {
    const groupStates = [];
    // Track whether every group has completed round 1
    let allGroupsRound1Done = true;
    for (const gid of ALL_GROUPS) {
      let gAllMatches: Match[];
      let gTeams: Team[];
      let gStandings: ReturnType<typeof calculateStandings>;
      let gPlayed: Match[];
      if (gid === groupId) {
        gAllMatches = allMatches;
        gTeams = teams;
        gStandings = standings;
        gPlayed = played;
      } else {
        const gTeamRows = await cachedQuery<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
        const gMatchRows = await cachedQuery<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round', [gid]);
        gTeams = gTeamRows.map(rowToTeam);
        gAllMatches = gMatchRows.map(rowToMatch);
        gPlayed = gAllMatches.filter((m) => m.status === 'FINISHED');
        gStandings = calculateStandings({ teams: gTeams, matches: gPlayed });
      }
      groupStates.push({
        groupId: gid,
        teams: gTeams,
        standings: gStandings,
        matchesPlayed: gPlayed.length,
        totalMatches: gAllMatches.length,
      });
      const round1 = gAllMatches.filter((m) => m.round === 1);
      if (round1.length === 0 || round1.some((m) => m.status !== 'FINISHED')) {
        allGroupsRound1Done = false;
      }
    }

    if (allGroupsRound1Done) {
      const bracket = await resolveKnockoutBracket(groupStates);
      const r32 = bracket.rounds.r32;
      const match = r32.find(
        (m) => m.home.resolved?.team.id === team.id || m.away.resolved?.team.id === team.id,
      );
      if (match) {
        const isHome = match.home.resolved?.team.id === team.id;
        const opponentSlot = isHome ? match.away : match.home;
        const opp = opponentSlot.resolved?.team ?? null;
        projectedOpponent = {
          roundLabel: ROUND_LABELS.r32,
          opponent: opp ? { name: opp.name, countryCode: opp.countryCode } : null,
          opponentPlaceholder: opponentSlot.placeholder,
          kickOff: match.kickOff,
          venue: match.venue,
          matchNumber: match.matchNumber,
        };
      }
    }
  }

  // AI-generated team article (cached). Read-only — never triggers a Claude
  // call here; the article is pregenerated in the match-update webhook flow.
  const teamArticle = await getCachedTeamArticle(team.id);

  const groupSlug = `group-${groupId.toLowerCase()}`;
  const teamRemaining = remaining
    .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
    .sort((a, b) => a.kickOff.localeCompare(b.kickOff));
  const teamRemainingMatches = teamRemaining.length;
  const nextMatch = teamRemaining.length > 0 ? teamRemaining[0] : null;
  const nextOpponent = nextMatch
    ? teamMap.get(nextMatch.homeTeamId === team.id ? nextMatch.awayTeamId : nextMatch.homeTeamId)
    : null;

  // Structured data: SportsTeam + BreadcrumbList for the team page.
  const teamCanonical = `${SITE_URL}/worldcup2026/${groupSlug}/team/${slugify(team.name)}`;
  const teamJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/worldcup2026` },
        {
          '@type': 'ListItem',
          position: 2,
          name: `Group ${groupId}`,
          item: `${SITE_URL}/worldcup2026/${groupSlug}`,
        },
        { '@type': 'ListItem', position: 3, name: team.name, item: teamCanonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: team.name,
      sport: 'Soccer',
      url: teamCanonical,
      memberOf: {
        '@type': 'SportsOrganization',
        name: 'FIFA',
        url: 'https://www.fifa.com',
      },
      ...(team.fifaRanking
        ? {
            athlete: undefined,
            // Custom-friendly hint about FIFA ranking via additional property
            additionalProperty: {
              '@type': 'PropertyValue',
              name: 'FIFA World Ranking',
              value: team.fifaRanking,
            },
          }
        : {}),
    },
  ];

  return (
    <main className="container py-4">
      <JsonLd data={teamJsonLd} />

      {/* Header: team name left, breadcrumb right */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="mb-0">
            <TeamFlag countryCode={team.countryCode} size="md" className="me-2" />
            {team.name}
          </h2>
          <div className="text-muted" style={{ fontSize: '0.95rem', marginTop: '0.25rem' }}>
            {team.fifaRanking && <>FIFA Ranking: {team.fifaRanking} | </>}
            Group {groupId} | {currentPosition ? `${currentPosition}. place` : '–'} | {teamRemainingMatches} {teamRemainingMatches === 1 ? 'match' : 'matches'} left
          </div>
          {nextMatch && nextOpponent && (
            <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.15rem' }}>
              Next Match: vs{' '}
              <TeamFlag countryCode={nextOpponent.countryCode} />
              {' '}{nextOpponent.name}
              {' · '}<NextMatchDate kickOff={nextMatch.kickOff} venue={nextMatch.venue} />
            </div>
          )}
        </div>
        <nav className="breadcrumb-nav" aria-label="Breadcrumb">
          <Link href="/worldcup2026">Home</Link>
          <span className="breadcrumb-sep">/</span>
          <Link href={`/worldcup2026/${groupSlug}`}>Group {groupId}</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{team.shortName}</span>
        </nav>
      </div>

      {/* Qualify/Eliminate widgets — placed ABOVE the article+table layout so
          the headline probabilities are the first thing visitors see. */}
      {teamHasPlayed && (
        <QualifyWidgets
          qualifyProb={qualifyProb}
          eliminateProb={eliminateProb}
          prob1st={probs[1] ?? 0}
          prob2nd={probs[2] ?? 0}
          prob3rd={probs[3] ?? 0}
          prob4th={probs[4] ?? 0}
          totalScenarios={teamSummary.totalScenarios}
          matchesRemaining={remaining.length}
          teamName={team.name}
          bestThirdRank={bestThirdRank}
          bestThirdQualifies={bestThirdQualifies}
        />
      )}

      {/* Article on the left, standings on the right (desktop). On mobile the
          layout collapses; the focus team's row in the table is highlighted
          in the same blue used by the playoff bracket. Self-references are
          excluded from auto-linking — every other team mention links to its
          page (every occurrence, not just the first). The team-matches widget
          is rendered in the right column directly under the standings table.
       */}
      {(() => {
        const teamMatches = allMatches
          .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
          .map((m) => ({
            id: m.id,
            round: m.round,
            homeTeam: {
              id: m.homeTeamId,
              name: teamMap.get(m.homeTeamId)?.name ?? '?',
              shortName: teamMap.get(m.homeTeamId)?.shortName ?? '?',
              countryCode: teamMap.get(m.homeTeamId)?.countryCode ?? '',
              fifaRanking: teamMap.get(m.homeTeamId)?.fifaRanking,
            },
            awayTeam: {
              id: m.awayTeamId,
              name: teamMap.get(m.awayTeamId)?.name ?? '?',
              shortName: teamMap.get(m.awayTeamId)?.shortName ?? '?',
              countryCode: teamMap.get(m.awayTeamId)?.countryCode ?? '',
              fifaRanking: teamMap.get(m.awayTeamId)?.fifaRanking,
            },
            homeGoals: m.homeGoals,
            awayGoals: m.awayGoals,
            homeYc: m.homeYc,
            homeYc2: m.homeYc2,
            homeRcDirect: m.homeRcDirect,
            homeYcRc: m.homeYcRc,
            awayYc: m.awayYc,
            awayYc2: m.awayYc2,
            awayRcDirect: m.awayRcDirect,
            awayYcRc: m.awayYcRc,
            venue: m.venue,
            kickOff: m.kickOff,
            status: m.status,
          }));
        const matchesWidget = teamMatches.length > 0 ? (
          <div className="group-card mb-4">
            <div className="group-card-header">
              <span>Matches</span>
            </div>
            <div className="group-card-body">
              <MatchList matches={teamMatches} />
            </div>
          </div>
        ) : null;

        return (
          <TeamScenarioView
            groupId={groupId}
            standings={standingsForDisplay}
            probabilities={probabilities}
            edgeScenariosByPosition={remaining.length > 0 && teamHasPlayed ? enrichedEdges : {}}
            scenarioProbabilities={remaining.length > 0 && teamHasPlayed ? probs : {}}
            teamName={team.name}
            focusTeamId={team.id}
            summaries={remaining.length > 0 && teamHasPlayed ? scenarioSummaries : undefined}
            teams={teams}
            playedMatches={played}
            articleSlot={teamArticle ? (
              <article className="group-article mb-4">
                <h1 className="group-article-headline">{teamArticle.headline}</h1>
                <p className="group-article-lede">{teamArticle.lede}</p>
                <CollapsibleArticleBody
                  html={autoLinkTeams(teamArticle.body_html, teams, groupId, team.name)}
                />
              </article>
            ) : undefined}
            belowStandingsSlot={matchesWidget}
          />
        );
      })()}

      {remaining.length === 0 && (
        <div className="alert alert-success">
          All matches have been played. Final standings are confirmed.
        </div>
      )}

      {/* Projected knockout opponent — placed AFTER the scenarios accordion
          so the visitor first sees what their team needs, then sees who
          they would face if current standings hold. */}
      {projectedOpponent && (
        <ProjectedOpponent
          roundLabel={projectedOpponent.roundLabel}
          opponent={projectedOpponent.opponent}
          opponentPlaceholder={projectedOpponent.opponentPlaceholder}
          kickOff={projectedOpponent.kickOff}
          venue={projectedOpponent.venue}
          teamName={team.name}
          matchNumber={projectedOpponent.matchNumber}
        />
      )}

      {/* Ad banner */}
      <AdBanner slot={AD_SLOT_TEAM_PAGE} format="auto" className="mt-4" />

      {/* SEO text */}
      <p className="text-muted mt-4" style={{ fontSize: '0.9rem' }}>
        Follow {team.name}&apos;s journey in Group {groupId} of the FIFA World Cup 2026.
        See current standings, qualification probability, and all possible scenarios for advancing to the knockout stage.
      </p>
    </main>
  );
}
