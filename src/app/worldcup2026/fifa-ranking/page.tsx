import { query } from '@/lib/db';
import FifaRankingClient from './FifaRankingClient';

export const dynamic = 'force-dynamic';

interface RankingTeam {
  id: number;
  name: string;
  short_name: string;
  country_code: string;
  group_id: string;
  fifa_ranking: number | null;
}

export default async function FifaRankingPage() {
  const teams = await query<RankingTeam>(
    'SELECT id, name, short_name, country_code, group_id, fifa_ranking FROM team ORDER BY fifa_ranking ASC NULLS LAST'
  );

  const logRows = await query<{ source_date: string | null }>(
    "SELECT source_date FROM scrape_log WHERE source = 'fifa-ranking' AND source_date IS NOT NULL ORDER BY id DESC LIMIT 1"
  );
  const rankingDate = logRows[0]?.source_date ?? null;

  // Extract unique groups sorted alphabetically
  const groups = [...new Set(teams.map((t) => t.group_id))].sort();

  return (
    <FifaRankingClient
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        shortName: t.short_name,
        countryCode: t.country_code,
        groupId: t.group_id,
        fifaRanking: t.fifa_ranking,
      }))}
      groups={groups}
      rankingDate={rankingDate}
    />
  );
}
