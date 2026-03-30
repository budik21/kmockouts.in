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
      error_message   TEXT
    );

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
  `);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
