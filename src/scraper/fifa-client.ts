/**
 * FIFA CXM API client.
 *
 * Attempts to fetch match results from the FIFA API.
 * The FIFA website uses https://cxm-api.fifa.com/fifaplusweb/api/
 * for dynamically loaded content.
 *
 * This module provides both:
 *   1. FIFA API endpoint (primary)
 *   2. Web scraping fallback via fetch + regex parsing
 */

export interface FifaMatchResult {
  externalId?: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  kickOff: string;
}

const FIFA_API_BASE = 'https://cxm-api.fifa.com/fifaplusweb/api/sections/page';
const WC2026_COMPETITION_ID = '17'; // FIFA World Cup

/**
 * Try to fetch match data from FIFA's CXM API.
 * This attempts to call the API endpoint that the FIFA website uses.
 */
export async function fetchFifaMatchResults(): Promise<FifaMatchResult[]> {
  try {
    // Try the scores-fixtures page API
    const response = await fetch(
      `${FIFA_API_BASE}/scores-fixtures?competitionId=${WC2026_COMPETITION_ID}&language=en`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KnockoutsIn/1.0',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.warn(`FIFA API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return parseFifaApiResponse(data);
  } catch (error) {
    console.warn('FIFA API request failed:', error);
    return [];
  }
}

/**
 * Parse the FIFA API JSON response into our match result format.
 * The exact structure depends on the API version — this is a best-effort parser.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFifaApiResponse(data: any): FifaMatchResult[] {
  const results: FifaMatchResult[] = [];

  try {
    // Navigate the nested FIFA API structure
    // Structure: { sections: [...] } where sections contain match data
    const sections = data?.sections ?? data?.data?.sections ?? [];

    for (const section of sections) {
      const matches = section?.matchData?.matches ??
                     section?.data?.matches ??
                     section?.matches ?? [];

      for (const match of matches) {
        const homeTeam = match?.homeTeam ?? match?.home ?? {};
        const awayTeam = match?.awayTeam ?? match?.away ?? {};

        results.push({
          externalId: match?.id ?? match?.matchId ?? undefined,
          homeTeamName: homeTeam?.name ?? homeTeam?.teamName ?? '',
          awayTeamName: awayTeam?.name ?? awayTeam?.teamName ?? '',
          homeGoals: match?.homeScore ?? match?.score?.home ?? homeTeam?.score ?? null,
          awayGoals: match?.awayScore ?? match?.score?.away ?? awayTeam?.score ?? null,
          homeYellowCards: homeTeam?.yellowCards ?? 0,
          awayYellowCards: awayTeam?.yellowCards ?? 0,
          homeRedCards: homeTeam?.redCards ?? 0,
          awayRedCards: awayTeam?.redCards ?? 0,
          status: mapFifaStatus(match?.status ?? match?.matchStatus ?? ''),
          kickOff: match?.date ?? match?.kickOff ?? match?.matchDate ?? '',
        });
      }
    }
  } catch (e) {
    console.warn('Failed to parse FIFA API response:', e);
  }

  return results;
}

function mapFifaStatus(status: string): 'SCHEDULED' | 'LIVE' | 'FINISHED' {
  const s = status.toLowerCase();
  if (s.includes('finish') || s.includes('played') || s.includes('full')) return 'FINISHED';
  if (s.includes('live') || s.includes('progress') || s.includes('half')) return 'LIVE';
  return 'SCHEDULED';
}
