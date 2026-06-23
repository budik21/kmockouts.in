/**
 * Knockout bracket synchronisation.
 *
 * Derives every play-off fixture's participants and writes them to the
 * `knockout_match` table:
 *   - Round of 32 from the final group standings (resolveKnockoutBracket, which
 *     applies FIFA Annex C for the 3rd-placed teams).
 *   - Later rounds from the advancing / eliminated team of the feeder matches,
 *     once those feeders are FINISHED.
 *
 * It also (re)derives `advancing_team_id` from each match's stored result. It
 * NEVER touches the raw result columns (goals/ET/pens) or `status` — those are
 * owned by the admin result flow, which calls this afterwards to propagate.
 */
import { GroupId, Team, TeamRow, MatchRow, Match } from '../lib/types';
import { ALL_GROUPS } from '../lib/constants';
import { query } from '../lib/db';
import { calculateStandings } from './standings';
import { resolveKnockoutBracket } from './knockout-resolver';
import {
  ALL_KNOCKOUT_MATCHES,
  KNOCKOUT_SCHEDULE,
  BracketSlot,
} from '../lib/knockout-bracket';
import { computeAdvancing } from '../lib/playoff-scoring';

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

interface GroupStateInput {
  groupId: GroupId;
  teams: Team[];
  standings: ReturnType<typeof calculateStandings>;
  matchesPlayed: number;
  totalMatches: number;
}

/** Load every group's standings from the DB (used to resolve the R32 slots). */
export async function loadGroupStates(): Promise<GroupStateInput[]> {
  const states: GroupStateInput[] = [];
  for (const gid of ALL_GROUPS) {
    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const allMatchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round', [gid]);
    const finishedRows = allMatchRows.filter((m) => m.status === 'FINISHED');
    const teams = teamRows.map(rowToTeam);
    const standings = calculateStandings({ teams, matches: finishedRows.map(rowToMatch) });
    states.push({
      groupId: gid as GroupId,
      teams,
      standings,
      matchesPlayed: finishedRows.length,
      totalMatches: allMatchRows.length,
    });
  }
  return states;
}

interface KnockoutResultRow {
  match_number: number;
  home_goals: number | null;
  away_goals: number | null;
  home_goals_et: number | null;
  away_goals_et: number | null;
  home_pens: number | null;
  away_pens: number | null;
  status: string;
}

/**
 * Recompute participants + advancing teams for the whole bracket and persist
 * them. Idempotent: safe to call after any group or knockout result change.
 *
 * Returns the number of knockout_match rows written.
 */
export async function recomputeKnockoutBracket(): Promise<number> {
  const groupStates = await loadGroupStates();
  const bracket = await resolveKnockoutBracket(groupStates);

  // Existing stored results (goals/ET/pens/status), keyed by match number.
  const resultRows = await query<KnockoutResultRow>(
    `SELECT match_number, home_goals, away_goals, home_goals_et, away_goals_et,
            home_pens, away_pens, status
     FROM knockout_match`,
  );
  const resultByNum = new Map<number, KnockoutResultRow>();
  for (const r of resultRows) resultByNum.set(r.match_number, r);

  // R32 participant resolution comes straight from the resolver output.
  const resolvedR32 = new Map<number, { homeId: number | null; awayId: number | null }>();
  for (const m of bracket.rounds.r32) {
    resolvedR32.set(m.matchNumber, {
      homeId: m.home.resolved?.team.id ?? null,
      awayId: m.away.resolved?.team.id ?? null,
    });
  }

  // Walk all matches in match-number order so a feeder is always resolved
  // before the match that depends on it.
  const participants = new Map<number, { homeId: number | null; awayId: number | null; advancingId: number | null }>();

  function resolveSlotTeam(slot: BracketSlot, matchNumber: number, side: 'home' | 'away'): number | null {
    switch (slot.type) {
      case 'group':
      case 'third': {
        const r = resolvedR32.get(matchNumber);
        return side === 'home' ? r?.homeId ?? null : r?.awayId ?? null;
      }
      case 'winner': {
        return participants.get(slot.matchNumber)?.advancingId ?? null;
      }
      case 'loser': {
        const p = participants.get(slot.matchNumber);
        if (!p || p.advancingId == null || p.homeId == null || p.awayId == null) return null;
        return p.homeId === p.advancingId ? p.awayId : p.homeId;
      }
    }
  }

  let written = 0;
  for (const def of ALL_KNOCKOUT_MATCHES) {
    const homeId = resolveSlotTeam(def.home, def.matchNumber, 'home');
    const awayId = resolveSlotTeam(def.away, def.matchNumber, 'away');

    const stored = resultByNum.get(def.matchNumber);
    const advancingId = computeAdvancing({
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeGoals: stored?.home_goals ?? null,
      awayGoals: stored?.away_goals ?? null,
      homeGoalsEt: stored?.home_goals_et ?? null,
      awayGoalsEt: stored?.away_goals_et ?? null,
      homePens: stored?.home_pens ?? null,
      awayPens: stored?.away_pens ?? null,
    });

    participants.set(def.matchNumber, { homeId, awayId, advancingId });

    const schedule = KNOCKOUT_SCHEDULE[def.matchNumber];
    // Preserve the admin-owned status/result; only the sync-owned columns
    // (round, schedule, participants, advancing) are written here.
    await query(
      `INSERT INTO knockout_match (match_number, round, home_team_id, away_team_id,
            advancing_team_id, kick_off, venue, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', NOW())
       ON CONFLICT (match_number) DO UPDATE SET
         round = EXCLUDED.round,
         home_team_id = EXCLUDED.home_team_id,
         away_team_id = EXCLUDED.away_team_id,
         advancing_team_id = EXCLUDED.advancing_team_id,
         kick_off = EXCLUDED.kick_off,
         venue = EXCLUDED.venue,
         updated_at = NOW()`,
      [
        def.matchNumber,
        def.round,
        homeId,
        awayId,
        advancingId,
        schedule?.kickOff ?? '',
        schedule?.venue ?? '',
      ],
    );
    written++;
  }

  return written;
}
