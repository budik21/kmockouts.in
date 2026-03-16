// ============================================================
// Core domain types for Knockouts.in WC2026
// ============================================================

export type GroupId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';

export interface Team {
  id: number;
  name: string;
  shortName: string;       // 3-letter code e.g. "MEX"
  countryCode: string;     // ISO 2-letter
  groupId: GroupId;
  isPlaceholder: boolean;  // TBD playoff teams
  externalId?: string;
}

export interface Match {
  id: number;
  groupId: GroupId;
  round: number;           // 1, 2, or 3
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null; // null = not played
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;          // second yellow → red incidents
  homeRcDirect: number;
  awayYc: number;
  awayYc2: number;          // second yellow → red incidents
  awayRcDirect: number;
  venue: string;
  kickOff: string;         // ISO 8601
  status: MatchStatus;
}

export interface MatchWithTeams extends Match {
  homeTeam: Team;
  awayTeam: Team;
}

export interface TeamStanding {
  team: Team;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  yellowCards: number;
  secondYellows: number;
  redCardsDirect: number;
  fairPlayPoints: number;
  position: number;
}

export interface GroupStandings {
  groupId: GroupId;
  standings: TeamStanding[];
  matchesPlayed: Match[];
  matchesRemaining: Match[];
}

// Score-range bucket outcome for simulations
export interface ScoreBucket {
  homeGoals: number;
  awayGoals: number;
  label: string;           // e.g. "Win by 3"
}

export interface SimulatedMatch {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  bucket: ScoreBucket;
}

export interface ScenarioResult {
  simulatedMatches: SimulatedMatch[];
  standings: TeamStanding[];
}

export interface TeamProbability {
  teamId: number;
  teamName: string;
  groupId: GroupId;
  probFirst: number;
  probSecond: number;
  probThird: number;
  probThirdQualified: number;  // qualifies as best third
  probOut: number;
  calculatedAt: string;
}

export interface EdgeScenario {
  position: number;       // 1, 2, 3, or 4
  conditions: ScenarioCondition[];
}

export interface ScenarioCondition {
  matchId: number;
  homeTeamName: string;
  awayTeamName: string;
  requiredOutcome: string; // e.g. "win by at least 3 goals", "draw or better"
}

// Database row types (snake_case from SQLite)
export interface TeamRow {
  id: number;
  name: string;
  short_name: string;
  country_code: string;
  group_id: string;
  is_placeholder: boolean;
  external_id: string | null;
}

export interface MatchRow {
  id: number;
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number | null;
  away_goals: number | null;
  home_yc: number;
  home_yc2: number;
  home_rc_direct: number;
  away_yc: number;
  away_yc2: number;
  away_rc_direct: number;
  venue: string;
  kick_off: string;
  status: string;
  last_scraped: string | null;
}
