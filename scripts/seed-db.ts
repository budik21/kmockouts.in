/**
 * Seed script: initializes the SQLite database with WC2026 teams and matches.
 * Run with: npx tsx scripts/seed-db.ts
 */
import { getDb, initializeSchema, closeDb } from '../src/lib/db';
import teamsData from '../data/seed/teams.json';
import matchesData from '../data/seed/matches.json';

function seed() {
  console.log('🏟️  Initializing WC2026 database...');
  initializeSchema();

  const db = getDb();

  // Clear existing data
  db.exec('DELETE FROM probability_cache');
  db.exec('DELETE FROM match');
  db.exec('DELETE FROM team');

  // Insert teams
  const insertTeam = db.prepare(`
    INSERT INTO team (id, name, short_name, country_code, group_id, is_placeholder)
    VALUES (@id, @name, @short_name, @country_code, @group_id, @is_placeholder)
  `);

  const insertTeams = db.transaction(() => {
    for (const team of teamsData) {
      insertTeam.run(team);
    }
  });
  insertTeams();
  console.log(`✅ Inserted ${teamsData.length} teams`);

  // Insert matches
  const insertMatch = db.prepare(`
    INSERT INTO match (group_id, round, home_team_id, away_team_id, venue, kick_off, status)
    VALUES (@group_id, @round, @home_team_id, @away_team_id, @venue, @kick_off, 'SCHEDULED')
  `);

  const insertMatches = db.transaction(() => {
    for (const match of matchesData) {
      insertMatch.run(match);
    }
  });
  insertMatches();
  console.log(`✅ Inserted ${matchesData.length} matches`);

  // Verify
  const teamCount = db.prepare('SELECT COUNT(*) as cnt FROM team').get() as { cnt: number };
  const matchCount = db.prepare('SELECT COUNT(*) as cnt FROM match').get() as { cnt: number };
  const groupCounts = db.prepare(
    'SELECT group_id, COUNT(*) as cnt FROM team GROUP BY group_id ORDER BY group_id'
  ).all() as { group_id: string; cnt: number }[];

  console.log(`\n📊 Database summary:`);
  console.log(`   Teams: ${teamCount.cnt}`);
  console.log(`   Matches: ${matchCount.cnt}`);
  console.log(`   Groups:`);
  for (const g of groupCounts) {
    console.log(`     Group ${g.group_id}: ${g.cnt} teams`);
  }

  closeDb();
  console.log('\n🎉 Seed complete!');
}

seed();
