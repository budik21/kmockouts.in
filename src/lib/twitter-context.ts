import { query, queryOne } from './db';
import { calculateStandings } from '../engine/standings';
import { slugify } from './slugify';
import { SITE_URL } from './seo';
import type { GroupId, TeamRow, MatchRow, Team, Match } from './types';

/**
 * Public team page URL — used as the auto-appended link in scenario tweets so
 * readers (and Twitter's link card preview, when no media is attached) can
 * jump to the team's page on knockouts.in. Mirrors canonical URL built in
 * src/app/worldcup2026/[groupId]/team/[teamId]/page.tsx.
 */
export function teamPageUrl(team: { name: string; groupId: string }): string {
  return `${SITE_URL}/worldcup2026/group-${team.groupId.toLowerCase()}/team/${slugify(team.name)}`;
}

/**
 * Twitter weighs every URL as 23 characters (t.co), regardless of its real
 * length. We add 1 for the leading space we put in front of it.
 */
export const APPENDED_URL_WEIGHT = 24;

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    countryCode: row.country_code,
    groupId: row.group_id as GroupId,
    isPlaceholder: row.is_placeholder,
    externalId: row.external_id ?? undefined,
    fifaRanking: row.fifa_ranking ?? undefined,
  };
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    groupId: row.group_id as GroupId,
    round: row.round,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    homeYc: row.home_yc,
    homeYc2: row.home_yc2,
    homeRcDirect: row.home_rc_direct,
    homeYcRc: row.home_yc_rc,
    awayYc: row.away_yc,
    awayYc2: row.away_yc2,
    awayRcDirect: row.away_rc_direct,
    awayYcRc: row.away_yc_rc,
    venue: row.venue,
    kickOff: row.kick_off,
    status: row.status as Match['status'],
  };
}

export interface TweetTeamSummary {
  id: number;
  name: string;
  shortName: string;
  countryCode: string;
  groupId: string;
}

export interface TweetProbabilities {
  advance: number;       // prob_first + prob_second
  thirdPlay: number;     // prob_third_qual (advances as best third)
  eliminated: number;    // 100 - advance - thirdPlay
}

export interface TweetMatchSummary {
  id: number;
  homeTeam: TweetTeamSummary;
  awayTeam: TweetTeamSummary;
  homeGoals: number | null;
  awayGoals: number | null;
  kickOff: string;
  round: number;
}

export interface TweetStandingRow {
  position: number;
  teamName: string;
  shortName: string;
  countryCode: string;
  matchesPlayed: number;
  points: number;
  goalDifference: number;
}

export interface TweetGroupContext {
  groupId: string;
  matchesPlayed: number;
  matchesTotal: number;
}

export interface PreMatchContext {
  kind: 'pre';
  team: TweetTeamSummary;
  group: TweetGroupContext;
  standings: TweetStandingRow[];
  probabilities: TweetProbabilities;
  nextMatch: TweetMatchSummary;
  opponent: TweetTeamSummary;
  /** Heuristic verdict of what the team needs (computed deterministically). */
  needHint: 'must_win' | 'win_or_draw' | 'any_result_safe' | 'must_win_big' | 'unclear';
}

export interface PostMatchContext {
  kind: 'post';
  team: TweetTeamSummary;
  group: TweetGroupContext;
  standings: TweetStandingRow[];
  probabilities: TweetProbabilities;
  lastMatch: TweetMatchSummary;
  opponent: TweetTeamSummary;
  result: 'win' | 'draw' | 'loss';
  scoreLineFor: string;     // e.g. "2-1" from team's perspective
}

interface ProbabilityRow {
  team_id: number;
  prob_first: number;
  prob_second: number;
  prob_third: number;
  prob_third_qual: number;
  prob_out: number;
}

async function loadGroupSnapshot(groupId: string) {
  const teamRows = await query<TeamRow>(
    'SELECT * FROM team WHERE group_id = $1 ORDER BY id',
    [groupId],
  );
  const matchRows = await query<MatchRow>(
    'SELECT * FROM match WHERE group_id = $1 ORDER BY kick_off, id',
    [groupId],
  );
  const probRows = await query<ProbabilityRow>(
    'SELECT team_id, prob_first, prob_second, prob_third, prob_third_qual, prob_out FROM probability_cache WHERE group_id = $1',
    [groupId],
  );

  const teams = teamRows.map(rowToTeam);
  const matches = matchRows.map(rowToMatch);
  const finished = matches.filter(m => m.status === 'FINISHED');
  const standings = calculateStandings({ teams, matches: finished });

  const probsByTeam = new Map<number, ProbabilityRow>();
  for (const p of probRows) probsByTeam.set(p.team_id, p);

  return { teams, matches, finished, standings, probsByTeam };
}

function teamSummary(t: Team): TweetTeamSummary {
  return {
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    countryCode: t.countryCode,
    groupId: t.groupId,
  };
}

function matchSummary(m: Match, teamMap: Map<number, Team>): TweetMatchSummary {
  const home = teamMap.get(m.homeTeamId)!;
  const away = teamMap.get(m.awayTeamId)!;
  return {
    id: m.id,
    round: m.round,
    kickOff: m.kickOff,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    homeTeam: teamSummary(home),
    awayTeam: teamSummary(away),
  };
}

function probabilitiesFromRow(row: ProbabilityRow | undefined): TweetProbabilities {
  if (!row) return { advance: 0, thirdPlay: 0, eliminated: 100 };
  const advance = (row.prob_first + row.prob_second) * 100;
  const thirdPlay = row.prob_third_qual * 100;
  const eliminated = Math.max(0, 100 - advance - thirdPlay);
  return {
    advance: Math.round(advance * 10) / 10,
    thirdPlay: Math.round(thirdPlay * 10) / 10,
    eliminated: Math.round(eliminated * 10) / 10,
  };
}

function buildStandingRows(snapshot: Awaited<ReturnType<typeof loadGroupSnapshot>>): TweetStandingRow[] {
  return snapshot.standings.map(s => ({
    position: s.position,
    teamName: s.team.name,
    shortName: s.team.shortName,
    countryCode: s.team.countryCode,
    matchesPlayed: s.matchesPlayed,
    points: s.points,
    goalDifference: s.goalDifference,
  }));
}

async function loadTeam(teamId: number): Promise<Team> {
  const row = await queryOne<TeamRow>('SELECT * FROM team WHERE id = $1', [teamId]);
  if (!row) throw new Error(`Team ${teamId} not found`);
  return rowToTeam(row);
}

export async function buildPostMatchContext(teamId: number): Promise<PostMatchContext> {
  const team = await loadTeam(teamId);
  const snap = await loadGroupSnapshot(team.groupId);
  const teamMap = new Map(snap.teams.map(t => [t.id, t]));

  // Last finished match in which the team played
  const teamFinished = snap.finished
    .filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => (b.kickOff > a.kickOff ? 1 : -1));

  if (teamFinished.length === 0) {
    throw new Error(`Team ${team.name} has no finished matches yet`);
  }

  const last = teamFinished[0];
  const isHome = last.homeTeamId === teamId;
  const teamGoals = (isHome ? last.homeGoals : last.awayGoals) ?? 0;
  const oppGoals = (isHome ? last.awayGoals : last.homeGoals) ?? 0;
  const result: 'win' | 'draw' | 'loss' =
    teamGoals > oppGoals ? 'win' : teamGoals === oppGoals ? 'draw' : 'loss';
  const opponent = isHome ? teamMap.get(last.awayTeamId)! : teamMap.get(last.homeTeamId)!;

  return {
    kind: 'post',
    team: teamSummary(team),
    group: {
      groupId: team.groupId,
      matchesPlayed: snap.finished.length,
      matchesTotal: snap.matches.length,
    },
    standings: buildStandingRows(snap),
    probabilities: probabilitiesFromRow(snap.probsByTeam.get(teamId)),
    lastMatch: matchSummary(last, teamMap),
    opponent: teamSummary(opponent),
    result,
    scoreLineFor: `${teamGoals}-${oppGoals}`,
  };
}

export async function buildPreMatchContext(teamId: number): Promise<PreMatchContext> {
  const team = await loadTeam(teamId);
  const snap = await loadGroupSnapshot(team.groupId);
  const teamMap = new Map(snap.teams.map(t => [t.id, t]));

  const upcoming = snap.matches
    .filter(m => m.status !== 'FINISHED' && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .sort((a, b) => (a.kickOff > b.kickOff ? 1 : -1));

  if (upcoming.length === 0) {
    throw new Error(`Team ${team.name} has no upcoming matches`);
  }

  const next = upcoming[0];
  const opponent = next.homeTeamId === teamId
    ? teamMap.get(next.awayTeamId)!
    : teamMap.get(next.homeTeamId)!;

  const probs = probabilitiesFromRow(snap.probsByTeam.get(teamId));
  const standing = snap.standings.find(s => s.team.id === teamId);

  // Deterministic verdict for the AI prompt and OG header
  let needHint: PreMatchContext['needHint'] = 'unclear';
  if (probs.advance >= 99.5) {
    needHint = 'any_result_safe';
  } else if (probs.eliminated >= 99.5) {
    needHint = 'unclear';
  } else if (standing) {
    const others = snap.standings.filter(s => s.team.id !== teamId);
    const top2Points = others.slice(0, 2).map(s => s.points);
    const minTopPts = top2Points[1] ?? 0;
    const gap = standing.points - minTopPts;
    if (gap >= 3) needHint = 'win_or_draw';
    else if (gap >= 0) needHint = 'must_win';
    else if (gap === -1) needHint = 'must_win';
    else needHint = 'must_win_big';
  }

  return {
    kind: 'pre',
    team: teamSummary(team),
    group: {
      groupId: team.groupId,
      matchesPlayed: snap.finished.length,
      matchesTotal: snap.matches.length,
    },
    standings: buildStandingRows(snap),
    probabilities: probs,
    nextMatch: matchSummary(next, teamMap),
    opponent: teamSummary(opponent),
    needHint,
  };
}

export async function listTeamsForSelector(): Promise<{ id: number; name: string; groupId: string; countryCode: string }[]> {
  const rows = await query<{ id: number; name: string; group_id: string; country_code: string }>(
    'SELECT id, name, group_id, country_code FROM team WHERE is_placeholder = false ORDER BY group_id, name',
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    groupId: r.group_id,
    countryCode: r.country_code,
  }));
}
