import { Pool, QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      max: 10,
    });
  }
  return pool;
}

/**
 * Convenience wrapper for pool.query().
 * Returns typed rows array.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/**
 * Convenience wrapper that returns the first row or null.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function initializeSchema(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team (
      id              INTEGER PRIMARY KEY,
      name            TEXT NOT NULL,
      short_name      TEXT NOT NULL,
      country_code    TEXT NOT NULL DEFAULT '',
      group_id        TEXT NOT NULL,
      is_placeholder  BOOLEAN NOT NULL DEFAULT false,
      external_id     TEXT
    );

    CREATE TABLE IF NOT EXISTS match (
      id              SERIAL PRIMARY KEY,
      group_id        TEXT NOT NULL,
      round           INTEGER NOT NULL,
      home_team_id    INTEGER NOT NULL REFERENCES team(id),
      away_team_id    INTEGER NOT NULL REFERENCES team(id),
      home_goals      INTEGER,
      away_goals      INTEGER,
      home_yc         INTEGER NOT NULL DEFAULT 0,
      home_rc_direct  INTEGER NOT NULL DEFAULT 0,
      away_yc         INTEGER NOT NULL DEFAULT 0,
      away_rc_direct  INTEGER NOT NULL DEFAULT 0,
      venue           TEXT NOT NULL DEFAULT '',
      kick_off        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'SCHEDULED',
      last_scraped    TEXT
    );

    CREATE TABLE IF NOT EXISTS probability_cache (
      group_id        TEXT NOT NULL,
      team_id         INTEGER NOT NULL,
      prob_first      DOUBLE PRECISION NOT NULL DEFAULT 0,
      prob_second     DOUBLE PRECISION NOT NULL DEFAULT 0,
      prob_third      DOUBLE PRECISION NOT NULL DEFAULT 0,
      prob_third_qual DOUBLE PRECISION NOT NULL DEFAULT 0,
      prob_out        DOUBLE PRECISION NOT NULL DEFAULT 0,
      scenarios_json  TEXT,
      calculated_at   TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      PRIMARY KEY (group_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id              SERIAL PRIMARY KEY,
      scraped_at      TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      source          TEXT,
      matches_updated INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL,
      error_message   TEXT,
      source_date     TEXT
    );

    -- Add source_date column if table already existed without it
    ALTER TABLE scrape_log ADD COLUMN IF NOT EXISTS source_date TEXT;

    CREATE TABLE IF NOT EXISTS news_article (
      id            SERIAL PRIMARY KEY,
      external_url  TEXT NOT NULL UNIQUE,
      title         TEXT NOT NULL,
      image_url     TEXT NOT NULL DEFAULT '',
      published_at  TIMESTAMPTZ,
      scraped_at    TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    CREATE INDEX IF NOT EXISTS idx_match_group ON match(group_id);
    CREATE INDEX IF NOT EXISTS idx_match_status ON match(status);
    CREATE INDEX IF NOT EXISTS idx_team_group ON team(group_id);

    -- Migrations for existing tables
    ALTER TABLE news_article ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
    ALTER TABLE match ADD COLUMN IF NOT EXISTS home_yc2 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE match ADD COLUMN IF NOT EXISTS away_yc2 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE match ADD COLUMN IF NOT EXISTS home_yc_rc INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE match ADD COLUMN IF NOT EXISTS away_yc_rc INTEGER NOT NULL DEFAULT 0;

    -- Admin whitelist
    CREATE TABLE IF NOT EXISTS admin_user (
      email TEXT PRIMARY KEY
    );
    INSERT INTO admin_user (email) VALUES ('radek.budar@gmail.com') ON CONFLICT DO NOTHING;

    -- FIFA World Ranking
    ALTER TABLE team ADD COLUMN IF NOT EXISTS fifa_ranking INTEGER;

    -- Recalculation status tracking
    CREATE TABLE IF NOT EXISTS recalc_status (
      group_id TEXT PRIMARY KEY,
      is_recalculating BOOLEAN NOT NULL DEFAULT false,
      started_at TEXT
    );

    -- User feedback
    CREATE TABLE IF NOT EXISTS feedback (
      id          SERIAL PRIMARY KEY,
      user_name   TEXT NOT NULL DEFAULT '',
      user_email  TEXT NOT NULL DEFAULT '',
      message     TEXT NOT NULL,
      page_url    TEXT NOT NULL DEFAULT '',
      user_agent  TEXT NOT NULL DEFAULT '',
      metadata    JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Add metadata column if table already existed without it
    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

    -- Best-third qualification probabilities (per-group)
    CREATE TABLE IF NOT EXISTS best_third_cache (
      group_id          TEXT PRIMARY KEY,
      qual_probability  DOUBLE PRECISION NOT NULL DEFAULT 0,
      calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Knockout stage: third-place team assignment combinations (FIFA Annex C)
    CREATE TABLE IF NOT EXISTS knockout_third_place_assignment (
      option_id         INTEGER PRIMARY KEY,
      pos_1a            TEXT NOT NULL,
      pos_1b            TEXT NOT NULL,
      pos_1d            TEXT NOT NULL,
      pos_1e            TEXT NOT NULL,
      pos_1g            TEXT NOT NULL,
      pos_1i            TEXT NOT NULL,
      pos_1k            TEXT NOT NULL,
      pos_1l            TEXT NOT NULL
    );

    -- AI-generated scenario summaries cache
    CREATE TABLE IF NOT EXISTS ai_summary_cache (
      group_id      TEXT NOT NULL,
      team_id       INTEGER NOT NULL,
      position      INTEGER NOT NULL,
      summary_html  TEXT NOT NULL,
      patterns_hash TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (group_id, team_id, position)
    );
  `);

  // ---- Seed knockout third-place combinations (FIFA Annex C) ----
  const existingCombos = await pool.query('SELECT COUNT(*) as cnt FROM knockout_third_place_assignment');
  if (parseInt(existingCombos.rows[0].cnt) === 0) {
    try {
      const combos = (await import('../../data/seed/knockout-third-place-combinations.json')).default;
      const values = combos.map((c: Record<string, string | number>) =>
        `(${c.option},'${c['1A']}','${c['1B']}','${c['1D']}','${c['1E']}','${c['1G']}','${c['1I']}','${c['1K']}','${c['1L']}')`
      ).join(',');
      await pool.query(
        `INSERT INTO knockout_third_place_assignment (option_id, pos_1a, pos_1b, pos_1d, pos_1e, pos_1g, pos_1i, pos_1k, pos_1l) VALUES ${values} ON CONFLICT DO NOTHING`
      );
      console.log(`Seeded ${combos.length} knockout third-place combinations`);
    } catch (e) {
      console.warn('Could not seed knockout combinations:', e);
    }
  }

  // ---- One-time data migrations ----

  // Replace playoff placeholders with confirmed teams
  await pool.query(`
    UPDATE team SET name = 'Czech Republic',    short_name = 'CZE', country_code = 'CZ', is_placeholder = false WHERE id = 4  AND is_placeholder = true;
    UPDATE team SET name = 'Bosnia-Herzegovina', short_name = 'BIH', country_code = 'BA', is_placeholder = false WHERE id = 6  AND is_placeholder = true;
    UPDATE team SET name = 'Türkiye',            short_name = 'TUR', country_code = 'TR', is_placeholder = false WHERE id = 16 AND is_placeholder = true;
    UPDATE team SET name = 'Sweden',             short_name = 'SWE', country_code = 'SE', is_placeholder = false WHERE id = 23 AND is_placeholder = true;
    UPDATE team SET name = 'Iraq',               short_name = 'IRQ', country_code = 'IQ', is_placeholder = false WHERE id = 35 AND is_placeholder = true;
    UPDATE team SET name = 'Congo DR',           short_name = 'COD', country_code = 'CD', is_placeholder = false WHERE id = 42 AND is_placeholder = true;
  `);

  // Clear probability cache for affected groups so it gets recalculated
  await pool.query(`
    DELETE FROM probability_cache WHERE group_id IN ('A','B','D','F','I','K')
      AND EXISTS (SELECT 1 FROM team WHERE id IN (4,6,16,23,35,42) AND is_placeholder = false AND short_name IN ('CZE','BIH','TUR','SWE','IRQ','COD'));
  `);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
