/**
 * Static definition of the FIFA World Cup 2026 knockout bracket.
 *
 * The bracket structure is fixed by FIFA regulations.
 * What changes dynamically is which teams fill each slot.
 */

import { GroupId } from './types';

// ── Slot types ───────────────────────────────────────────────
/** A team from a specific group position (1st, 2nd, or 3rd) */
export interface GroupSlot {
  type: 'group';
  position: 1 | 2 | 3;
  group: GroupId;
}

/** A 3rd-place team determined by the Annex C lookup */
export interface ThirdPlaceSlot {
  type: 'third';
  /** Which group winner this 3rd-place team faces (determines the Annex C column) */
  facesWinnerOf: GroupId;
  /** Possible source groups (shown in placeholder mode) */
  possibleGroups: GroupId[];
}

/** Winner of a previous knockout match */
export interface WinnerSlot {
  type: 'winner';
  matchNumber: number;
}

/** Loser of a previous knockout match */
export interface LoserSlot {
  type: 'loser';
  matchNumber: number;
}

export type BracketSlot = GroupSlot | ThirdPlaceSlot | WinnerSlot | LoserSlot;

export type KnockoutRoundName = 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'thirdPlace';

export interface KnockoutMatchDef {
  matchNumber: number;
  round: KnockoutRoundName;
  home: BracketSlot;
  away: BracketSlot;
}

// ── Round of 32 (matches 73-88) ─────────────────────────────
// 4 matches: runner-up vs runner-up
// 4 matches: group winner vs group runner-up (cross)
// 8 matches: group winner vs 3rd-place team

export const ROUND_OF_32: KnockoutMatchDef[] = [
  // Runner-up vs runner-up
  { matchNumber: 73, round: 'r32', home: { type: 'group', position: 2, group: 'A' }, away: { type: 'group', position: 2, group: 'B' } },
  { matchNumber: 78, round: 'r32', home: { type: 'group', position: 2, group: 'E' }, away: { type: 'group', position: 2, group: 'I' } },
  { matchNumber: 83, round: 'r32', home: { type: 'group', position: 2, group: 'K' }, away: { type: 'group', position: 2, group: 'L' } },
  { matchNumber: 88, round: 'r32', home: { type: 'group', position: 2, group: 'D' }, away: { type: 'group', position: 2, group: 'G' } },

  // Group winner vs runner-up (cross)
  { matchNumber: 75, round: 'r32', home: { type: 'group', position: 1, group: 'F' }, away: { type: 'group', position: 2, group: 'C' } },
  { matchNumber: 76, round: 'r32', home: { type: 'group', position: 1, group: 'C' }, away: { type: 'group', position: 2, group: 'F' } },
  { matchNumber: 84, round: 'r32', home: { type: 'group', position: 1, group: 'H' }, away: { type: 'group', position: 2, group: 'J' } },
  { matchNumber: 86, round: 'r32', home: { type: 'group', position: 1, group: 'J' }, away: { type: 'group', position: 2, group: 'H' } },

  // Group winner vs 3rd-place team
  { matchNumber: 74, round: 'r32', home: { type: 'group', position: 1, group: 'E' }, away: { type: 'third', facesWinnerOf: 'E', possibleGroups: ['A', 'B', 'C', 'D', 'F'] } },
  { matchNumber: 77, round: 'r32', home: { type: 'group', position: 1, group: 'I' }, away: { type: 'third', facesWinnerOf: 'I', possibleGroups: ['C', 'D', 'F', 'G', 'H'] } },
  { matchNumber: 79, round: 'r32', home: { type: 'group', position: 1, group: 'A' }, away: { type: 'third', facesWinnerOf: 'A', possibleGroups: ['C', 'E', 'F', 'H', 'I'] } },
  { matchNumber: 80, round: 'r32', home: { type: 'group', position: 1, group: 'L' }, away: { type: 'third', facesWinnerOf: 'L', possibleGroups: ['E', 'H', 'I', 'J', 'K'] } },
  { matchNumber: 81, round: 'r32', home: { type: 'group', position: 1, group: 'D' }, away: { type: 'third', facesWinnerOf: 'D', possibleGroups: ['B', 'E', 'F', 'I', 'J'] } },
  { matchNumber: 82, round: 'r32', home: { type: 'group', position: 1, group: 'G' }, away: { type: 'third', facesWinnerOf: 'G', possibleGroups: ['A', 'E', 'H', 'I', 'J'] } },
  { matchNumber: 85, round: 'r32', home: { type: 'group', position: 1, group: 'B' }, away: { type: 'third', facesWinnerOf: 'B', possibleGroups: ['E', 'F', 'G', 'I', 'J'] } },
  { matchNumber: 87, round: 'r32', home: { type: 'group', position: 1, group: 'K' }, away: { type: 'third', facesWinnerOf: 'K', possibleGroups: ['D', 'E', 'I', 'J', 'L'] } },
];

// ── Round of 16 (matches 89-96) ─────────────────────────────
export const ROUND_OF_16: KnockoutMatchDef[] = [
  { matchNumber: 89, round: 'r16', home: { type: 'winner', matchNumber: 74 }, away: { type: 'winner', matchNumber: 77 } },
  { matchNumber: 90, round: 'r16', home: { type: 'winner', matchNumber: 73 }, away: { type: 'winner', matchNumber: 75 } },
  { matchNumber: 91, round: 'r16', home: { type: 'winner', matchNumber: 76 }, away: { type: 'winner', matchNumber: 78 } },
  { matchNumber: 92, round: 'r16', home: { type: 'winner', matchNumber: 79 }, away: { type: 'winner', matchNumber: 80 } },
  { matchNumber: 93, round: 'r16', home: { type: 'winner', matchNumber: 83 }, away: { type: 'winner', matchNumber: 84 } },
  { matchNumber: 94, round: 'r16', home: { type: 'winner', matchNumber: 81 }, away: { type: 'winner', matchNumber: 82 } },
  { matchNumber: 95, round: 'r16', home: { type: 'winner', matchNumber: 86 }, away: { type: 'winner', matchNumber: 88 } },
  { matchNumber: 96, round: 'r16', home: { type: 'winner', matchNumber: 85 }, away: { type: 'winner', matchNumber: 87 } },
];

// ── Quarterfinals (matches 97-100) ──────────────────────────
export const QUARTERFINALS: KnockoutMatchDef[] = [
  { matchNumber: 97, round: 'qf', home: { type: 'winner', matchNumber: 89 }, away: { type: 'winner', matchNumber: 90 } },
  { matchNumber: 98, round: 'qf', home: { type: 'winner', matchNumber: 93 }, away: { type: 'winner', matchNumber: 94 } },
  { matchNumber: 99, round: 'qf', home: { type: 'winner', matchNumber: 91 }, away: { type: 'winner', matchNumber: 92 } },
  { matchNumber: 100, round: 'qf', home: { type: 'winner', matchNumber: 95 }, away: { type: 'winner', matchNumber: 96 } },
];

// ── Semifinals (matches 101-102) ────────────────────────────
export const SEMIFINALS: KnockoutMatchDef[] = [
  { matchNumber: 101, round: 'sf', home: { type: 'winner', matchNumber: 97 }, away: { type: 'winner', matchNumber: 98 } },
  { matchNumber: 102, round: 'sf', home: { type: 'winner', matchNumber: 99 }, away: { type: 'winner', matchNumber: 100 } },
];

// ── Final & Third-Place Match ───────────────────────────────
export const FINAL: KnockoutMatchDef = {
  matchNumber: 104, round: 'final',
  home: { type: 'winner', matchNumber: 101 },
  away: { type: 'winner', matchNumber: 102 },
};

export const THIRD_PLACE_MATCH: KnockoutMatchDef = {
  matchNumber: 103, round: 'thirdPlace',
  home: { type: 'loser', matchNumber: 101 },
  away: { type: 'loser', matchNumber: 102 },
};

/** All knockout matches in order */
export const ALL_KNOCKOUT_MATCHES: KnockoutMatchDef[] = [
  ...ROUND_OF_32,
  ...ROUND_OF_16,
  ...QUARTERFINALS,
  ...SEMIFINALS,
  THIRD_PLACE_MATCH,
  FINAL,
];

/** Map from Annex C column name to the group winner it faces */
export const ANNEX_C_COLUMN_TO_GROUP: Record<string, GroupId> = {
  '1A': 'A', '1B': 'B', '1D': 'D', '1E': 'E',
  '1G': 'G', '1I': 'I', '1K': 'K', '1L': 'L',
};

/** Round display labels */
export const ROUND_LABELS: Record<KnockoutRoundName, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarterfinals',
  sf: 'Semifinals',
  thirdPlace: 'Third-place match',
  final: 'Final',
};

/** Static knockout match schedule (kick-off UTC, venue) */
export const KNOCKOUT_SCHEDULE: Record<number, { kickOff: string; venue: string }> = {
  // Round of 32
  73: { kickOff: '2026-06-28T19:00:00Z', venue: 'SoFi Stadium, Inglewood' },
  74: { kickOff: '2026-06-29T20:30:00Z', venue: 'Gillette Stadium, Foxborough' },
  75: { kickOff: '2026-06-30T01:00:00Z', venue: 'Estadio BBVA, Guadalupe' },
  76: { kickOff: '2026-06-29T17:00:00Z', venue: 'NRG Stadium, Houston' },
  77: { kickOff: '2026-06-30T21:00:00Z', venue: 'MetLife Stadium, East Rutherford' },
  78: { kickOff: '2026-06-30T17:00:00Z', venue: 'AT&T Stadium, Arlington' },
  79: { kickOff: '2026-07-01T01:00:00Z', venue: 'Estadio Azteca, Mexico City' },
  80: { kickOff: '2026-07-01T16:00:00Z', venue: 'Mercedes-Benz Stadium, Atlanta' },
  81: { kickOff: '2026-07-02T00:00:00Z', venue: "Levi's Stadium, Santa Clara" },
  82: { kickOff: '2026-07-01T20:00:00Z', venue: 'Lumen Field, Seattle' },
  83: { kickOff: '2026-07-02T23:00:00Z', venue: 'BMO Field, Toronto' },
  84: { kickOff: '2026-07-02T19:00:00Z', venue: 'SoFi Stadium, Inglewood' },
  85: { kickOff: '2026-07-03T03:00:00Z', venue: 'BC Place, Vancouver' },
  86: { kickOff: '2026-07-03T22:00:00Z', venue: 'Hard Rock Stadium, Miami Gardens' },
  87: { kickOff: '2026-07-04T01:30:00Z', venue: 'GEHA Field at Arrowhead Stadium, Kansas City' },
  88: { kickOff: '2026-07-03T18:00:00Z', venue: 'AT&T Stadium, Arlington' },
  // Round of 16
  89: { kickOff: '2026-07-04T17:00:00Z', venue: 'Lincoln Financial Field, Philadelphia' },
  90: { kickOff: '2026-07-04T17:00:00Z', venue: 'NRG Stadium, Houston' },
  91: { kickOff: '2026-07-05T20:00:00Z', venue: 'MetLife Stadium, East Rutherford' },
  92: { kickOff: '2026-07-06T00:00:00Z', venue: 'Estadio Azteca, Mexico City' },
  93: { kickOff: '2026-07-06T19:00:00Z', venue: 'AT&T Stadium, Arlington' },
  94: { kickOff: '2026-07-07T00:00:00Z', venue: 'Lumen Field, Seattle' },
  95: { kickOff: '2026-07-07T16:00:00Z', venue: 'Mercedes-Benz Stadium, Atlanta' },
  96: { kickOff: '2026-07-07T20:00:00Z', venue: 'BC Place, Vancouver' },
  // Quarterfinals
  97: { kickOff: '2026-07-09T20:00:00Z', venue: 'Gillette Stadium, Foxborough' },
  98: { kickOff: '2026-07-10T19:00:00Z', venue: 'SoFi Stadium, Inglewood' },
  99: { kickOff: '2026-07-11T21:00:00Z', venue: 'Hard Rock Stadium, Miami Gardens' },
  100: { kickOff: '2026-07-12T01:00:00Z', venue: 'GEHA Field at Arrowhead Stadium, Kansas City' },
  // Semifinals
  101: { kickOff: '2026-07-14T19:00:00Z', venue: 'AT&T Stadium, Arlington' },
  102: { kickOff: '2026-07-15T19:00:00Z', venue: 'Mercedes-Benz Stadium, Atlanta' },
  // Third-place match & Final
  103: { kickOff: '2026-07-18T21:00:00Z', venue: 'Hard Rock Stadium, Miami Gardens' },
  104: { kickOff: '2026-07-19T19:00:00Z', venue: 'MetLife Stadium, East Rutherford' },
};
