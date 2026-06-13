// One-off helper to populate the local leaderboard with dummy predictors so the
// UI (medals, top-3 highlight, pager, "out of X" widget) can be eyeballed.
// All seeded users use the @seed.local domain so they're trivial to remove:
//   DELETE FROM tipster_user WHERE email LIKE '%@seed.local';   (tips cascade)
//
// Run: node --env-file=.env scripts/seed-dummy-leaderboard.mjs
import { Client } from 'pg';

const USER_COUNT = 35;

const FIRST = [
  'Lukas', 'Petra', 'Tomas', 'Jana', 'Martin', 'Eva', 'Jakub', 'Karolina',
  'Ondrej', 'Tereza', 'David', 'Veronika', 'Filip', 'Lucie', 'Marek',
  'Barbora', 'Adam', 'Klara', 'Vojtech', 'Nikola', 'Daniel', 'Michaela',
  'Pavel', 'Kristyna', 'Jan', 'Anna', 'Matej', 'Katerina', 'Stepan',
  'Simona', 'Radek', 'Denisa', 'Vit', 'Hana', 'Zdenek', 'Monika', 'Roman',
];
const LAST = [
  'Novak', 'Svoboda', 'Dvorak', 'Cerny', 'Prochazka', 'Kucera', 'Vesely',
  'Horak', 'Nemec', 'Pokorny', 'Marek', 'Pospisil', 'Hajek', 'Kral',
  'Jelinek', 'Ruzicka', 'Fiala', 'Sedlak', 'Dolezal', 'Zeman', 'Kolar',
  'Navratil', 'Cermak', 'Urban', 'Vanek', 'Blazek', 'Kriz', 'Kovar',
  'Benes', 'Vlcek', 'Stastny', 'Sykora', 'Maly', 'Bartos', 'Soukup',
];

function slugify(s) {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function randToken(name) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let h = '';
  for (let i = 0; i < 6; i++) h += chars[Math.floor(Math.random() * chars.length)];
  return `${slugify(name) || 'user'}-${h}`;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const matchRows = (await c.query('SELECT id FROM match ORDER BY id')).rows.map((r) => r.id);

const usedNames = new Set();
let created = 0;

for (let i = 0; i < USER_COUNT; i++) {
  // Build a unique-ish display name
  let name;
  do {
    name = `${pick(FIRST)} ${pick(LAST)}`;
  } while (usedNames.has(name));
  usedNames.add(name);

  const email = `${slugify(name)}.${i}@seed.local`;
  const token = randToken(name);

  const userRes = await c.query(
    `INSERT INTO tipster_user (email, name, image, share_token, tips_public)
     VALUES ($1, $2, '', $3, TRUE)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, share_token = EXCLUDED.share_token
     RETURNING id`,
    [email, name, token],
  );
  const userId = userRes.rows[0].id;

  // Clear any previous seeded tips for idempotency
  await c.query('DELETE FROM tip WHERE user_id = $1', [userId]);

  // Each user tips a random subset of matches; "skill" controls how many land.
  const tipCount = 15 + Math.floor(Math.random() * 45); // 15..59 tips
  const skill = 0.15 + Math.random() * 0.6;             // 0.15..0.75
  const matches = shuffle(matchRows).slice(0, tipCount);

  const values = [];
  const params = [];
  let p = 1;
  for (const matchId of matches) {
    const roll = Math.random();
    let points;
    if (roll < skill * 0.35) points = 4;          // exact score
    else if (roll < skill) points = 1;            // correct outcome
    else if (roll < 0.9) points = 0;              // wrong
    else points = null;                            // not yet scored
    const hg = Math.floor(Math.random() * 4);
    const ag = Math.floor(Math.random() * 4);
    values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, NOW(), NOW())`);
    params.push(userId, matchId, hg, ag, points);
  }
  await c.query(
    `INSERT INTO tip (user_id, match_id, home_goals, away_goals, points, created_at, updated_at)
     VALUES ${values.join(', ')}`,
    params,
  );
  created++;
}

// Report resulting leaderboard ordering
const board = await c.query(`
  SELECT u.name,
    COUNT(t.id) FILTER (WHERE t.points = 4) * 4 + COUNT(t.id) FILTER (WHERE t.points = 1) AS pts,
    COUNT(t.id) AS tips
  FROM tipster_user u
  LEFT JOIN tip t ON t.user_id = u.id
  WHERE u.tips_public = true
  GROUP BY u.id, u.name
  HAVING COUNT(t.id) > 0
  ORDER BY pts DESC
`);
console.log(`Seeded ${created} dummy users. Leaderboard now has ${board.rows.length} ranked tipsters.`);
console.log('Top 5:', board.rows.slice(0, 5).map((r) => `${r.name} (${r.pts} pts)`).join(', '));

await c.end();
