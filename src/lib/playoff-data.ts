/**
 * Read helpers shared by the play-off pages, APIs and admin editor.
 */
import { query } from './db';
import {
  ROUND_LABELS,
  KnockoutRoundName,
  ALL_KNOCKOUT_MATCHES,
  slotPlaceholder,
} from './knockout-bracket';

export interface PlayoffTeam {
  id: number;
  name: string;
  shortName: string;
  countryCode: string;
}

export interface KnockoutMatchView {
  matchNumber: number;
  round: KnockoutRoundName;
  roundLabel: string;
  homeTeam: PlayoffTeam | null;
  awayTeam: PlayoffTeam | null;
  kickOff: string;
  venue: string;
  status: string;             // SCHEDULED | FINISHED
  homeGoals: number | null;   // 90'
  awayGoals: number | null;
  homeGoalsEt: number | null;
  awayGoalsEt: number | null;
  homePens: number | null;
  awayPens: number | null;
  advancingTeamId: number | null;
  /** Both participants known → tippable (subject to the kick-off lock). */
  participantsKnown: boolean;
}

interface KnockoutMatchRow {
  match_number: number;
  round: string;
  kick_off: string;
  venue: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_goals_et: number | null;
  away_goals_et: number | null;
  home_pens: number | null;
  away_pens: number | null;
  advancing_team_id: number | null;
  home_id: number | null;
  home_name: string | null;
  home_short: string | null;
  home_code: string | null;
  away_id: number | null;
  away_name: string | null;
  away_short: string | null;
  away_code: string | null;
}

/** All knockout fixtures with resolved team info, ordered by match number. */
export async function getKnockoutMatches(): Promise<KnockoutMatchView[]> {
  const rows = await query<KnockoutMatchRow>(
    `SELECT km.match_number, km.round, km.kick_off, km.venue, km.status,
            km.home_goals, km.away_goals, km.home_goals_et, km.away_goals_et,
            km.home_pens, km.away_pens, km.advancing_team_id,
            ht.id AS home_id, ht.name AS home_name, ht.short_name AS home_short, ht.country_code AS home_code,
            at.id AS away_id, at.name AS away_name, at.short_name AS away_short, at.country_code AS away_code
     FROM knockout_match km
     LEFT JOIN team ht ON ht.id = km.home_team_id
     LEFT JOIN team at ON at.id = km.away_team_id
     ORDER BY km.match_number`,
  );

  return rows.map((r) => ({
    matchNumber: r.match_number,
    round: r.round as KnockoutRoundName,
    roundLabel: ROUND_LABELS[r.round as KnockoutRoundName] ?? r.round,
    homeTeam: r.home_id != null
      ? { id: r.home_id, name: r.home_name!, shortName: r.home_short!, countryCode: r.home_code! }
      : null,
    awayTeam: r.away_id != null
      ? { id: r.away_id, name: r.away_name!, shortName: r.away_short!, countryCode: r.away_code! }
      : null,
    kickOff: r.kick_off,
    venue: r.venue,
    status: r.status,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    homeGoalsEt: r.home_goals_et,
    awayGoalsEt: r.away_goals_et,
    homePens: r.home_pens,
    awayPens: r.away_pens,
    advancingTeamId: r.advancing_team_id,
    participantsKnown: r.home_id != null && r.away_id != null,
  }));
}

/** A play-off fixture for the public Fixtures calendar. When a participant is
 *  known it carries the resolved team (with its origin group, so we can link to
 *  the team and group pages); otherwise only a static placeholder label. */
export interface PlayoffFixtureTeam extends PlayoffTeam {
  /** Origin group letter (A–L) — used to build team/group page links. */
  groupId: string;
}

export interface PlayoffFixture {
  matchNumber: number;
  round: KnockoutRoundName;
  roundLabel: string;
  kickOff: string;
  venue: string;
  status: string;
  homeTeam: PlayoffFixtureTeam | null;
  awayTeam: PlayoffFixtureTeam | null;
  /** Placeholder labels shown when the participant is not yet decided. */
  homePlaceholder: string;
  awayPlaceholder: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeGoalsEt: number | null;
  awayGoalsEt: number | null;
  homePens: number | null;
  awayPens: number | null;
  advancingTeamId: number | null;
}

interface PlayoffFixtureRow {
  match_number: number;
  round: string;
  kick_off: string;
  venue: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_goals_et: number | null;
  away_goals_et: number | null;
  home_pens: number | null;
  away_pens: number | null;
  advancing_team_id: number | null;
  home_id: number | null;
  home_name: string | null;
  home_short: string | null;
  home_code: string | null;
  home_group: string | null;
  away_id: number | null;
  away_name: string | null;
  away_short: string | null;
  away_code: string | null;
  away_group: string | null;
}

/** All knockout fixtures for the public calendar: resolved teams (with origin
 *  group) when known, static placeholder labels otherwise. Ordered by kick-off. */
export async function getPlayoffFixtures(): Promise<PlayoffFixture[]> {
  const rows = await query<PlayoffFixtureRow>(
    `SELECT km.match_number, km.round, km.kick_off, km.venue, km.status,
            km.home_goals, km.away_goals, km.home_goals_et, km.away_goals_et,
            km.home_pens, km.away_pens, km.advancing_team_id,
            ht.id AS home_id, ht.name AS home_name, ht.short_name AS home_short,
            ht.country_code AS home_code, ht.group_id AS home_group,
            at.id AS away_id, at.name AS away_name, at.short_name AS away_short,
            at.country_code AS away_code, at.group_id AS away_group
     FROM knockout_match km
     LEFT JOIN team ht ON ht.id = km.home_team_id
     LEFT JOIN team at ON at.id = km.away_team_id
     ORDER BY km.kick_off, km.match_number`,
  );

  // Static slot definitions → placeholder labels, keyed by match number.
  const defByNum = new Map(ALL_KNOCKOUT_MATCHES.map((m) => [m.matchNumber, m]));

  const toTeam = (
    id: number | null, name: string | null, short: string | null,
    code: string | null, group: string | null,
  ): PlayoffFixtureTeam | null =>
    id != null
      ? { id, name: name!, shortName: short!, countryCode: code!, groupId: group ?? '' }
      : null;

  return rows.map((r) => {
    const def = defByNum.get(r.match_number);
    return {
      matchNumber: r.match_number,
      round: r.round as KnockoutRoundName,
      roundLabel: ROUND_LABELS[r.round as KnockoutRoundName] ?? r.round,
      kickOff: r.kick_off,
      venue: r.venue,
      status: r.status,
      homeTeam: toTeam(r.home_id, r.home_name, r.home_short, r.home_code, r.home_group),
      awayTeam: toTeam(r.away_id, r.away_name, r.away_short, r.away_code, r.away_group),
      homePlaceholder: def ? slotPlaceholder(def.home) : 'TBD',
      awayPlaceholder: def ? slotPlaceholder(def.away) : 'TBD',
      homeGoals: r.home_goals,
      awayGoals: r.away_goals,
      homeGoalsEt: r.home_goals_et,
      awayGoalsEt: r.away_goals_et,
      homePens: r.home_pens,
      awayPens: r.away_pens,
      advancingTeamId: r.advancing_team_id,
    };
  });
}

/**
 * The teams eligible for the top-4 picks: every team that appears in a Round of
 * 32 fixture (i.e. the 32 qualified knockout teams). Sorted by name. Empty until
 * the bracket has been synced and the groups resolved.
 */
export async function getPlayoffTeams(): Promise<PlayoffTeam[]> {
  const rows = await query<{ id: number; name: string; short_name: string; country_code: string }>(
    `SELECT DISTINCT t.id, t.name, t.short_name, t.country_code
     FROM knockout_match km
     JOIN team t ON t.id IN (km.home_team_id, km.away_team_id)
     WHERE km.round = 'r32'
     ORDER BY t.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    countryCode: r.country_code,
  }));
}

export interface UserKnockoutTip {
  matchNumber: number;
  homeGoals: number;
  awayGoals: number;
  advanceTeamId: number;
  points: number | null;
}

export async function getUserKnockoutTips(userId: number): Promise<UserKnockoutTip[]> {
  const rows = await query<{ match_number: number; home_goals: number; away_goals: number; advance_team_id: number; points: number | null }>(
    `SELECT match_number, home_goals, away_goals, advance_team_id, points
     FROM knockout_tip WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({
    matchNumber: r.match_number,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    advanceTeamId: r.advance_team_id,
    points: r.points,
  }));
}

export interface UserPlayoffPick {
  slot: string;
  teamId: number;
  points: number | null;
}

export async function getUserPlayoffPicks(userId: number): Promise<UserPlayoffPick[]> {
  const rows = await query<{ slot: string; team_id: number; points: number | null }>(
    `SELECT slot, team_id, points FROM playoff_pick WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({ slot: r.slot, teamId: r.team_id, points: r.points }));
}
