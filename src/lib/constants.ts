import { GroupId, ScoreBucket } from './types';

export const ALL_GROUPS: GroupId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// FIFA WC2026: Top 2 from each group + best 8 of 12 third-placed teams
export const QUALIFY_TOP_N = 2;           // auto-qualify from each group
export const QUALIFY_BEST_THIRD = 8;      // best third-placed teams that qualify
export const TOTAL_GROUPS = 12;
export const TEAMS_PER_GROUP = 4;
export const MATCHES_PER_GROUP = 6;       // each team plays 3 matches
export const ROUNDS_PER_GROUP = 3;

// Monte Carlo settings
export const MONTE_CARLO_ITERATIONS = 10_000;
export const MONTE_CARLO_THRESHOLD = 6;   // use MC when remaining matches >= this

// Score-range buckets for simulation (14 buckets)
export const SCORE_BUCKETS: ScoreBucket[] = [
  // Home wins
  { homeGoals: 1, awayGoals: 0, label: 'Home win by 1' },
  { homeGoals: 2, awayGoals: 0, label: 'Home win by 2' },
  { homeGoals: 3, awayGoals: 0, label: 'Home win by 3' },
  { homeGoals: 4, awayGoals: 0, label: 'Home win by 4' },
  { homeGoals: 5, awayGoals: 0, label: 'Home win by 5' },
  { homeGoals: 6, awayGoals: 0, label: 'Home win by 6+' },
  // Draws
  { homeGoals: 0, awayGoals: 0, label: 'Draw 0-0' },
  { homeGoals: 1, awayGoals: 1, label: 'Draw 1-1+' },
  // Away wins
  { homeGoals: 0, awayGoals: 1, label: 'Away win by 1' },
  { homeGoals: 0, awayGoals: 2, label: 'Away win by 2' },
  { homeGoals: 0, awayGoals: 3, label: 'Away win by 3' },
  { homeGoals: 0, awayGoals: 4, label: 'Away win by 4' },
  { homeGoals: 0, awayGoals: 5, label: 'Away win by 5' },
  { homeGoals: 0, awayGoals: 6, label: 'Away win by 6+' },
];

// FIFA Article 13 — Fair Play point deductions
export const FAIR_PLAY_YELLOW_CARD = -1;
export const FAIR_PLAY_RED_CARD_DIRECT = -4;
export const FAIR_PLAY_YELLOW_THEN_RED = -5;  // YC + RC in same match for same player
