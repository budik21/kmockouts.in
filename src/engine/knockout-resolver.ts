/**
 * Knockout bracket resolver.
 *
 * Resolves placeholder slots to actual teams based on current group standings.
 * Uses FIFA Annex C combinations (from DB) to assign 3rd-place teams.
 */

import { GroupId, Team, TeamStanding } from '../lib/types';
import {
  ALL_KNOCKOUT_MATCHES,
  KnockoutMatchDef,
  KnockoutRoundName,
  BracketSlot,
  ThirdPlaceSlot,
  KNOCKOUT_SCHEDULE,
} from '../lib/knockout-bracket';
import { calculateStandings } from './standings';
import { compareThirdPlaced } from './best-third';
import { ALL_GROUPS } from '../lib/constants';
import { query } from '../lib/db';

// ── Public types ─────────────────────────────────────────────

export interface ResolvedTeam {
  team: Team;
  /** e.g. "A1", "C2", "3rd F" */
  label: string;
}

export interface ResolvedSlot {
  /** Resolved team, or null if still a placeholder */
  resolved: ResolvedTeam | null;
  /** Placeholder label shown when team is not yet resolved (e.g. "A1", "3rd CEF") */
  placeholder: string;
}

export interface ResolvedMatch {
  matchNumber: number;
  round: KnockoutRoundName;
  home: ResolvedSlot;
  away: ResolvedSlot;
  kickOff: string | null;
  venue: string | null;
}

export interface BracketData {
  /** Whether all group matches have been played (groups fully resolved) */
  groupsComplete: boolean;
  /** Whether at least one team in every group has played (brackets start showing real teams) */
  canResolve: boolean;
  /** Qualifying 3rd-place groups (sorted), null if can't resolve yet */
  qualifyingThirdGroups: GroupId[] | null;
  /** All bracket matches, organized by round */
  rounds: Record<KnockoutRoundName, ResolvedMatch[]>;
}

// ── Internal types ───────────────────────────────────────────

interface GroupState {
  groupId: GroupId;
  teams: Team[];
  standings: TeamStanding[];
  matchesPlayed: number;
  totalMatches: number;
}

interface ThirdPlaceAssignment {
  pos_1a: string; pos_1b: string; pos_1d: string; pos_1e: string;
  pos_1g: string; pos_1i: string; pos_1k: string; pos_1l: string;
}

// ── Column mapping ───────────────────────────────────────────

const FACES_WINNER_TO_COLUMN: Record<string, keyof ThirdPlaceAssignment> = {
  'A': 'pos_1a', 'B': 'pos_1b', 'D': 'pos_1d', 'E': 'pos_1e',
  'G': 'pos_1g', 'I': 'pos_1i', 'K': 'pos_1k', 'L': 'pos_1l',
};

// ── Main resolver ────────────────────────────────────────────

export async function resolveKnockoutBracket(
  groupStates: GroupState[],
): Promise<BracketData> {
  const groupMap = new Map<GroupId, GroupState>();
  for (const gs of groupStates) {
    groupMap.set(gs.groupId, gs);
  }

  // Check if every team has at least 1 match played
  const canResolve = groupStates.every(gs => gs.matchesPlayed > 0);

  // Check if all groups are complete (all 6 matches per group played)
  const groupsComplete = groupStates.every(gs => gs.matchesPlayed === gs.totalMatches);

  // Build position lookup: group → position → team
  const positionLookup = new Map<string, Team>(); // key: "A1", "B2", "C3"
  if (canResolve) {
    for (const gs of groupStates) {
      for (const standing of gs.standings) {
        const key = `${gs.groupId}${standing.position}`;
        positionLookup.set(key, standing.team);
      }
    }
  }

  // Resolve 3rd-place assignments via Annex C
  let thirdPlaceMap: Map<GroupId, GroupId> | null = null; // facesWinnerOf → sourceGroup
  let qualifyingThirdGroups: GroupId[] | null = null;

  if (canResolve) {
    // Get all 3rd-placed teams and rank them
    const thirdPlaced: { groupId: GroupId; standing: TeamStanding }[] = [];
    for (const gs of groupStates) {
      const third = gs.standings.find(s => s.position === 3);
      if (third) {
        thirdPlaced.push({ groupId: gs.groupId, standing: third });
      }
    }
    thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

    // Top 8 qualify
    const qualifiers = thirdPlaced.slice(0, 8);
    qualifyingThirdGroups = qualifiers.map(q => q.groupId).sort() as GroupId[];

    // Look up the assignment in the DB
    const assignment = await findThirdPlaceAssignment(qualifyingThirdGroups);
    if (assignment) {
      thirdPlaceMap = new Map();
      for (const [facesWinner, column] of Object.entries(FACES_WINNER_TO_COLUMN)) {
        const sourceGroup = assignment[column] as GroupId;
        thirdPlaceMap.set(facesWinner as GroupId, sourceGroup);
      }
    }
  }

  // Resolve each match
  const resolvedMatches: ResolvedMatch[] = ALL_KNOCKOUT_MATCHES.map(matchDef => {
    const schedule = KNOCKOUT_SCHEDULE[matchDef.matchNumber];
    return {
      matchNumber: matchDef.matchNumber,
      round: matchDef.round,
      home: resolveSlot(matchDef.home, positionLookup, thirdPlaceMap, canResolve),
      away: resolveSlot(matchDef.away, positionLookup, thirdPlaceMap, canResolve),
      kickOff: schedule?.kickOff ?? null,
      venue: schedule?.venue ?? null,
    };
  });

  // Organize by round
  const rounds: Record<KnockoutRoundName, ResolvedMatch[]> = {
    r32: [], r16: [], qf: [], sf: [], thirdPlace: [], final: [],
  };
  for (const m of resolvedMatches) {
    rounds[m.round].push(m);
  }

  return {
    groupsComplete,
    canResolve,
    qualifyingThirdGroups,
    rounds,
  };
}

// ── Slot resolution ──────────────────────────────────────────

function resolveSlot(
  slot: BracketSlot,
  positionLookup: Map<string, Team>,
  thirdPlaceMap: Map<GroupId, GroupId> | null,
  canResolve: boolean,
): ResolvedSlot {
  switch (slot.type) {
    case 'group': {
      const placeholder = `${slot.group}${slot.position}`;
      if (!canResolve) {
        return { resolved: null, placeholder };
      }
      const team = positionLookup.get(placeholder);
      if (team) {
        return { resolved: { team, label: placeholder }, placeholder };
      }
      return { resolved: null, placeholder };
    }

    case 'third': {
      const placeholder = `3rd ${slot.possibleGroups.join('')}`;
      if (!canResolve || !thirdPlaceMap) {
        return { resolved: null, placeholder };
      }
      const sourceGroup = thirdPlaceMap.get(slot.facesWinnerOf);
      if (sourceGroup) {
        const team = positionLookup.get(`${sourceGroup}3`);
        if (team) {
          return {
            resolved: { team, label: `${sourceGroup}3` },
            placeholder,
          };
        }
      }
      return { resolved: null, placeholder };
    }

    case 'winner':
    case 'loser': {
      // Future: resolve from actual knockout match results
      const placeholder = `${slot.type === 'winner' ? 'W' : 'L'}${slot.matchNumber}`;
      return { resolved: null, placeholder };
    }
  }
}

// ── DB lookup ────────────────────────────────────────────────

async function findThirdPlaceAssignment(
  qualifyingGroups: GroupId[],
): Promise<ThirdPlaceAssignment | null> {
  // The qualifying groups determine which Annex C row to use.
  // We need to find the row where the 8 column values match exactly these 8 groups.
  const sorted = [...qualifyingGroups].sort();

  const rows = await query<ThirdPlaceAssignment>(
    `SELECT pos_1a, pos_1b, pos_1d, pos_1e, pos_1g, pos_1i, pos_1k, pos_1l
     FROM knockout_third_place_assignment`
  );

  for (const row of rows) {
    const rowGroups = [
      row.pos_1a, row.pos_1b, row.pos_1d, row.pos_1e,
      row.pos_1g, row.pos_1i, row.pos_1k, row.pos_1l,
    ].sort();

    if (rowGroups.length === sorted.length && rowGroups.every((g, i) => g === sorted[i])) {
      return row;
    }
  }

  return null;
}
