/**
 * Build a single team's knockout "journey" — the ordered chain of matches it
 * passes through from the Round of 32 onward — for the per-team page widgets.
 *
 * The chain itself is fixed by the static bracket structure (a team's R32 match
 * feeds one R16 match, which feeds one QF, etc.). What's dynamic is which slots
 * are resolved and which matches are finished, taken from `getPlayoffFixtures`.
 */
import {
  ALL_KNOCKOUT_MATCHES,
  KnockoutRoundName,
  BracketSlot,
} from './knockout-bracket';
import type { PlayoffFixture, PlayoffFixtureTeam } from './playoff-data';

export type PathNodeKind = 'result' | 'upcoming' | 'awaits' | 'eliminated';

export interface KnockoutPathNode {
  round: KnockoutRoundName;
  roundLabel: string;
  matchNumber: number;
  kind: PathNodeKind;
  /** Resolved opponent, when both the match participant is known. */
  opponent: PlayoffFixtureTeam | null;
  /** When the opponent is the winner of an undecided match, the two candidates. */
  opponentPair: [PlayoffFixtureTeam, PlayoffFixtureTeam] | null;
  /** Fallback label (e.g. "W77") when neither opponent nor pair is available. */
  opponentPlaceholder: string;
  /** Finished-match score, oriented from the team's perspective. */
  teamGoals: number | null;
  oppGoals: number | null;
  teamPens: number | null;
  oppPens: number | null;
  /** Extra time was played. */
  aet: boolean;
  /** The team advanced from this match (only meaningful when kind === 'result'). */
  teamAdvanced: boolean;
  kickOff: string | null;
  venue: string | null;
}

const DEF_BY_NUM = new Map(ALL_KNOCKOUT_MATCHES.map((m) => [m.matchNumber, m]));

/** Match numbers a team passes through, starting at its R32 match. Walks the
 *  winner-slot chain R32→R16→QF→SF→Final; the 3rd-place match (fed by SF
 *  losers) is never on a winner-walk, so it is correctly excluded. */
function pathMatchNumbers(r32MatchNumber: number): number[] {
  const path = [r32MatchNumber];
  let prev = r32MatchNumber;
  // At most 4 further rounds (R16, QF, SF, Final); cap guards against cycles.
  for (let hop = 0; hop < 4; hop++) {
    const next = ALL_KNOCKOUT_MATCHES.find(
      (m) => feedsFrom(m.home, prev) || feedsFrom(m.away, prev),
    );
    if (!next) break;
    path.push(next.matchNumber);
    prev = next.matchNumber;
  }
  return path;
}

/** True when a slot is the winner of a given match number. */
function feedsFrom(slot: BracketSlot, matchNumber: number): boolean {
  return slot.type === 'winner' && slot.matchNumber === matchNumber;
}

/** Which side of `def` carries the winner of `prevMatchNumber`. */
function teamSideFromFeed(matchNumber: number, prevMatchNumber: number): 'home' | 'away' {
  const def = DEF_BY_NUM.get(matchNumber);
  if (def && feedsFrom(def.home, prevMatchNumber)) return 'home';
  return 'away';
}

const oppOf = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');

/** The opponent team / placeholder on `oppSide` of a fixture. */
function opponentTeam(f: PlayoffFixture, oppSide: 'home' | 'away'): PlayoffFixtureTeam | null {
  return oppSide === 'home' ? f.homeTeam : f.awayTeam;
}
function opponentPlaceholder(f: PlayoffFixture, oppSide: 'home' | 'away'): string {
  return oppSide === 'home' ? f.homePlaceholder : f.awayPlaceholder;
}

/** When the opponent is the winner of an undecided feeding match, the two
 *  candidate teams (if both are already known). */
function opponentCandidates(
  matchNumber: number,
  oppSide: 'home' | 'away',
  byNum: Map<number, PlayoffFixture>,
): [PlayoffFixtureTeam, PlayoffFixtureTeam] | null {
  const def = DEF_BY_NUM.get(matchNumber);
  if (!def) return null;
  const slot = oppSide === 'home' ? def.home : def.away;
  if (slot.type !== 'winner') return null;
  const feeder = byNum.get(slot.matchNumber);
  if (feeder?.homeTeam && feeder.awayTeam) return [feeder.homeTeam, feeder.awayTeam];
  return null;
}

/**
 * Build the knockout path for `teamId`, or null when the team is not (yet) in
 * the bracket — i.e. it has not qualified to the play-off.
 *
 * The returned nodes are exactly the widgets to render, left to right:
 *   - every finished match the team won (kind 'result'),
 *   - then either the current upcoming match (kind 'upcoming') + the next round
 *     it awaits (kind 'awaits'),
 *   - or, if it lost a finished match, that match (kind 'result') + the round it
 *     did not reach, flagged for the "run ended" stopwatch (kind 'eliminated').
 */
export function buildKnockoutPath(
  teamId: number,
  fixtures: PlayoffFixture[],
): KnockoutPathNode[] | null {
  const byNum = new Map(fixtures.map((f) => [f.matchNumber, f]));

  const r32 = fixtures.find(
    (f) => f.round === 'r32' && (f.homeTeam?.id === teamId || f.awayTeam?.id === teamId),
  );
  if (!r32) return null;

  const nums = pathMatchNumbers(r32.matchNumber);
  const nodes: KnockoutPathNode[] = [];
  let prevNum = 0;

  const makeNode = (
    f: PlayoffFixture,
    teamSide: 'home' | 'away',
    kind: PathNodeKind,
  ): KnockoutPathNode => {
    const oppSide = oppOf(teamSide);
    const aet = f.homeGoalsEt != null && f.awayGoalsEt != null;
    const homeG = f.homeGoalsEt ?? f.homeGoals;
    const awayG = f.awayGoalsEt ?? f.awayGoals;
    const finished = kind === 'result';
    return {
      round: f.round,
      roundLabel: f.roundLabel,
      matchNumber: f.matchNumber,
      kind,
      opponent: opponentTeam(f, oppSide),
      opponentPair: opponentTeam(f, oppSide) ? null : opponentCandidates(f.matchNumber, oppSide, byNum),
      opponentPlaceholder: opponentPlaceholder(f, oppSide),
      teamGoals: finished ? (teamSide === 'home' ? homeG : awayG) : null,
      oppGoals: finished ? (teamSide === 'home' ? awayG : homeG) : null,
      teamPens: finished ? (teamSide === 'home' ? f.homePens : f.awayPens) : null,
      oppPens: finished ? (teamSide === 'home' ? f.awayPens : f.homePens) : null,
      aet: finished && aet,
      teamAdvanced: f.advancingTeamId === teamId,
      kickOff: f.kickOff,
      venue: f.venue,
    };
  };

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    const f = byNum.get(num);
    if (!f) break;

    const teamSide: 'home' | 'away' =
      i === 0 ? (f.homeTeam?.id === teamId ? 'home' : 'away') : teamSideFromFeed(num, prevNum);

    const homeG = f.homeGoalsEt ?? f.homeGoals;
    const awayG = f.awayGoalsEt ?? f.awayGoals;
    const finished = f.status === 'FINISHED' && homeG != null && awayG != null;

    if (finished) {
      const node = makeNode(f, teamSide, 'result');
      nodes.push(node);
      if (!node.teamAdvanced) {
        // Eliminated here: append a stopwatch widget for the round not reached.
        const nextNum = nums[i + 1];
        const nf = nextNum != null ? byNum.get(nextNum) : undefined;
        if (nf) {
          nodes.push({
            round: nf.round,
            roundLabel: nf.roundLabel,
            matchNumber: nf.matchNumber,
            kind: 'eliminated',
            opponent: null,
            opponentPair: null,
            opponentPlaceholder: '',
            teamGoals: null,
            oppGoals: null,
            teamPens: null,
            oppPens: null,
            aet: false,
            teamAdvanced: false,
            kickOff: null,
            venue: null,
          });
        }
        break;
      }
      prevNum = num;
      continue;
    }

    // First not-yet-played match on the path → the real upcoming fixture, plus
    // the round the team awaits after it.
    nodes.push(makeNode(f, teamSide, 'upcoming'));
    const nextNum = nums[i + 1];
    const nf = nextNum != null ? byNum.get(nextNum) : undefined;
    if (nf) {
      const nTeamSide = teamSideFromFeed(nextNum!, num);
      nodes.push(makeNode(nf, nTeamSide, 'awaits'));
    }
    break;
  }

  return nodes;
}
