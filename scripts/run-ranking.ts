import { scrapeFifaRankings } from '../src/scraper/fifa-ranking';
import { getPool, initializeSchema } from '../src/lib/db';

async function run() {
  await initializeSchema(); // ensure source_date column exists
  await scrapeFifaRankings();

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT name, short_name, fifa_ranking, group_id FROM team ORDER BY fifa_ranking ASC NULLS LAST'
  );
  console.log('\nCurrent rankings:');
  for (const r of rows) {
    console.log(
      (r.fifa_ranking?.toString() ?? '---').padStart(3) +
        '  ' + r.group_id +
        '  ' + r.short_name.padEnd(4) +
        ' ' + r.name
    );
  }
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
