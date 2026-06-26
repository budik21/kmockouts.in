import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { GroupId, TeamRow, MatchRow, Team, Match } from '@/lib/types';
import { calculateStandings } from '@/engine/standings';
import { resolveKnockoutBracket, ResolvedSlot } from '@/engine/knockout-resolver';
import { getKnockoutMatches, PlayoffTeam } from '@/lib/playoff-data';
import { ALL_GROUPS } from '@/lib/constants';
import { WC_TAG } from '@/lib/cache-tags';

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

/**
 * A resolved team for the public bracket response. Carries only what the
 * bracket cards render. When a knockout result has been entered the slot's
 * team comes straight from `knockout_match` (the stored, propagated bracket);
 * otherwise it falls back to the live group-standings resolution.
 */
interface SlotResponse {
  resolved: { team: PlayoffTeam; label: string } | null;
  pair?: [{ team: PlayoffTeam; label: string }, { team: PlayoffTeam; label: string }];
  placeholder: string;
}

/** Result overlay for a finished knockout match. */
interface MatchResultResponse {
  status: string; // FINISHED
  homeGoals: number | null;
  awayGoals: number | null;
  homeGoalsEt: number | null;
  awayGoalsEt: number | null;
  homePens: number | null;
  awayPens: number | null;
  advancingTeamId: number | null;
}

/**
 * Merge the live-standings resolution of a slot with the participant actually
 * stored in `knockout_match`. The stored team wins when present (it reflects
 * the propagated bracket, including winners of earlier knockout matches that
 * the standings resolver leaves as placeholders).
 */
function mergeSlot(slot: ResolvedSlot, storedTeam: PlayoffTeam | null): SlotResponse {
  if (storedTeam) {
    return {
      resolved: { team: storedTeam, label: slot.resolved?.label ?? storedTeam.shortName },
      placeholder: slot.placeholder,
    };
  }
  return {
    resolved: slot.resolved
      ? { team: toPlayoffTeam(slot.resolved.team), label: slot.resolved.label }
      : null,
    pair: slot.pair?.map((p) => ({ team: toPlayoffTeam(p.team), label: p.label })) as
      | [{ team: PlayoffTeam; label: string }, { team: PlayoffTeam; label: string }]
      | undefined,
    placeholder: slot.placeholder,
  };
}

function toPlayoffTeam(team: Team): PlayoffTeam {
  return { id: team.id, name: team.name, shortName: team.shortName, countryCode: team.countryCode };
}

/**
 * Build the public knockout-bracket payload by merging two sources:
 *   - `resolveKnockoutBracket` over the live group standings → placeholders,
 *     R32 participants resolved via Annex C, and the R16 "A/B" opponent pairs.
 *   - `knockout_match` (via getKnockoutMatches) → the actually stored
 *     participants for every round (winners propagated by the admin result
 *     flow) and each finished match's score + advancing team.
 *
 * Cached under WC_TAG so entering a play-off result — which calls
 * `expireTags(WC_TAG)` — immediately invalidates the bracket.
 */
async function buildBracketResponse() {
  const groupStates = [];
  for (const gid of ALL_GROUPS) {
    const teamRows = await query<TeamRow>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const allMatchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY round', [gid]);
    const finishedMatchRows = allMatchRows.filter((m) => m.status === 'FINISHED');

    const teams = teamRows.map(rowToTeam);
    const finishedMatches = finishedMatchRows.map(rowToMatch);
    const standings = calculateStandings({ teams, matches: finishedMatches });

    groupStates.push({
      groupId: gid as GroupId,
      teams,
      standings,
      matchesPlayed: finishedMatchRows.length,
      totalMatches: allMatchRows.length,
    });
  }

  const bracket = await resolveKnockoutBracket(groupStates);

  // Overlay stored participants + results from the knockout_match table.
  const koMatches = await getKnockoutMatches();
  const koByNum = new Map(koMatches.map((m) => [m.matchNumber, m]));

  const rounds: Record<string, unknown[]> = {};
  for (const [roundName, matches] of Object.entries(bracket.rounds)) {
    rounds[roundName] = matches.map((m) => {
      const ko = koByNum.get(m.matchNumber);
      const result: MatchResultResponse | null =
        ko && ko.status === 'FINISHED'
          ? {
              status: ko.status,
              homeGoals: ko.homeGoals,
              awayGoals: ko.awayGoals,
              homeGoalsEt: ko.homeGoalsEt,
              awayGoalsEt: ko.awayGoalsEt,
              homePens: ko.homePens,
              awayPens: ko.awayPens,
              advancingTeamId: ko.advancingTeamId,
            }
          : null;
      return {
        matchNumber: m.matchNumber,
        round: m.round,
        home: mergeSlot(m.home, ko?.homeTeam ?? null),
        away: mergeSlot(m.away, ko?.awayTeam ?? null),
        kickOff: m.kickOff,
        venue: m.venue,
        result,
      };
    });
  }

  return {
    groupsComplete: bracket.groupsComplete,
    canResolve: bracket.canResolve,
    qualifyingThirdGroups: bracket.qualifyingThirdGroups,
    rounds,
  };
}

const getCachedBracketResponse = unstable_cache(
  buildBracketResponse,
  ['knockout-bracket-merged'],
  { tags: [WC_TAG] },
);

export async function GET() {
  const bracket = await getCachedBracketResponse();

  return NextResponse.json(bracket, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
