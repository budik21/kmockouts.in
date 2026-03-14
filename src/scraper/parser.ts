/**
 * Parser: normalizes external API data into our internal format.
 * Maps team names from external sources to our database team IDs.
 */

import { FifaMatchResult } from './fifa-client';

export interface ParsedMatchUpdate {
  /** We match by home/away team within a group */
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeRcDirect: number;
  awayYc: number;
  awayRcDirect: number;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
}

/**
 * Name mapping: FIFA API team names -> our DB short_name.
 * Handles common variations in naming.
 */
const TEAM_NAME_ALIASES: Record<string, string> = {
  // Standard mappings
  'mexico': 'MEX', 'south africa': 'RSA', 'south korea': 'KOR', 'korea republic': 'KOR',
  'canada': 'CAN', 'qatar': 'QAT', 'switzerland': 'SUI',
  'brazil': 'BRA', 'morocco': 'MAR', 'haiti': 'HAI', 'scotland': 'SCO',
  'united states': 'USA', 'usa': 'USA', 'united states of america': 'USA',
  'paraguay': 'PAR', 'australia': 'AUS',
  'germany': 'GER', 'curaçao': 'CUW', 'curacao': 'CUW',
  'ivory coast': 'CIV', "côte d'ivoire": 'CIV', 'cote divoire': 'CIV',
  'ecuador': 'ECU',
  'netherlands': 'NED', 'holland': 'NED', 'japan': 'JPN', 'tunisia': 'TUN',
  'belgium': 'BEL', 'egypt': 'EGY', 'iran': 'IRN', 'ir iran': 'IRN',
  'new zealand': 'NZL',
  'spain': 'ESP', 'cape verde': 'CPV', 'cabo verde': 'CPV',
  'saudi arabia': 'KSA', 'uruguay': 'URU',
  'france': 'FRA', 'senegal': 'SEN', 'norway': 'NOR',
  'argentina': 'ARG', 'algeria': 'ALG', 'austria': 'AUT', 'jordan': 'JOR',
  'portugal': 'POR', 'uzbekistan': 'UZB', 'colombia': 'COL',
  'england': 'ENG', 'croatia': 'CRO', 'ghana': 'GHA', 'panama': 'PAN',
  // Playoff teams - will be updated when known
  'italy': 'EPA', 'northern ireland': 'EPA', 'wales': 'EPA', 'bosnia and herzegovina': 'EPA',
  'turkey': 'EPC', 'türkiye': 'EPC', 'romania': 'EPC', 'slovakia': 'EPC', 'kosovo': 'EPC',
  'ukraine': 'EPB', 'sweden': 'EPB', 'poland': 'EPB', 'albania': 'EPB',
  'denmark': 'EPD', 'north macedonia': 'EPD', 'czechia': 'EPD', 'czech republic': 'EPD',
  'ireland': 'EPD', 'republic of ireland': 'EPD',
};

/**
 * Normalize a team name to our short_name format.
 */
export function normalizeTeamName(name: string): string | null {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? null;
}

/**
 * Parse FIFA API results into our update format.
 */
export function parseFifaResults(results: FifaMatchResult[]): ParsedMatchUpdate[] {
  return results
    .filter((r) => r.homeTeamName && r.awayTeamName)
    .map((r) => ({
      homeTeamName: r.homeTeamName,
      awayTeamName: r.awayTeamName,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      homeYc: r.homeYellowCards,
      homeRcDirect: r.homeRedCards,
      awayYc: r.awayYellowCards,
      awayRcDirect: r.awayRedCards,
      status: r.status,
    }));
}
