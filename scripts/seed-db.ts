/**
 * Seed script: initializes the PostgreSQL database with WC2026 teams and matches.
 * Run with: npx tsx scripts/seed-db.ts
 */
import { getPool, initializeSchema, closeDb } from '../src/lib/db';
import teamsData from '../data/seed/teams.json';
import matchesData from '../data/seed/matches.json';

async function seed() {
  console.log('🏟️  Initializing WC2026 database...');
  await initializeSchema();

  const pool = getPool();

  // Clear existing data
  await pool.query('DELETE FROM probability_cache');
  await pool.query('DELETE FROM match');
  await pool.query('DELETE FROM team');

  // Insert teams
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const team of teamsData as Array<{ id: number; name: string; short_name: string; country_code: string; group_id: string; is_placeholder: number }>) {
      await client.query(
        'INSERT INTO team (id, name, short_name, country_code, group_id, is_placeholder) VALUES ($1, $2, $3, $4, $5, $6)',
        [team.id, team.name, team.short_name, team.country_code, team.group_id, team.is_placeholder === 1]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`✅ Inserted ${teamsData.length} teams`);

  // Insert matches
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');
    for (const match of matchesData as Array<{ group_id: string; round: number; home_team_id: number; away_team_id: number; venue: string; kick_off: string }>) {
      await client2.query(
        `INSERT INTO match (group_id, round, home_team_id, away_team_id, venue, kick_off, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED')`,
        [match.group_id, match.round, match.home_team_id, match.away_team_id, match.venue, match.kick_off]
      );
    }
    await client2.query('COMMIT');
  } catch (e) {
    await client2.query('ROLLBACK');
    throw e;
  } finally {
    client2.release();
  }
  console.log(`✅ Inserted ${matchesData.length} matches`);

  // Verify
  const teamCount = await pool.query('SELECT COUNT(*) as cnt FROM team');
  const matchCount = await pool.query('SELECT COUNT(*) as cnt FROM match');
  const groupCounts = await pool.query(
    'SELECT group_id, COUNT(*) as cnt FROM team GROUP BY group_id ORDER BY group_id'
  );

  console.log(`\n📊 Database summary:`);
  console.log(`   Teams: ${teamCount.rows[0].cnt}`);
  console.log(`   Matches: ${matchCount.rows[0].cnt}`);
  console.log(`   Groups:`);
  for (const g of groupCounts.rows) {
    console.log(`     Group ${g.group_id}: ${g.cnt} teams`);
  }

  await closeDb();
  console.log('\n🎉 Seed complete!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
