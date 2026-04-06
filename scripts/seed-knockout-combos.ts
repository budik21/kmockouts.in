import { getPool, initializeSchema, closeDb } from '../src/lib/db';
import combos from '../data/seed/knockout-third-place-combinations.json';

async function seed() {
  console.log('Initializing schema...');
  await initializeSchema();

  const pool = getPool();
  const { rows } = await pool.query('SELECT COUNT(*) as cnt FROM knockout_third_place_assignment');
  const count = parseInt(rows[0].cnt);
  console.log(`Existing rows: ${count}`);

  if (count === 0) {
    const values = combos.map((c: Record<string, string | number>) =>
      `(${c.option},'${c['1A']}','${c['1B']}','${c['1D']}','${c['1E']}','${c['1G']}','${c['1I']}','${c['1K']}','${c['1L']}')`
    ).join(',');
    await pool.query(
      `INSERT INTO knockout_third_place_assignment (option_id, pos_1a, pos_1b, pos_1d, pos_1e, pos_1g, pos_1i, pos_1k, pos_1l) VALUES ${values}`
    );
    console.log(`Seeded ${combos.length} combinations`);
  } else {
    console.log('Already seeded, skipping');
  }

  const { rows: check } = await pool.query('SELECT COUNT(*) as cnt FROM knockout_third_place_assignment');
  console.log(`Final count: ${check[0].cnt}`);

  await closeDb();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
