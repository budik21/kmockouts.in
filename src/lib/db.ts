import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'wc2026.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');      // Better concurrent access
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initializeSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS team (
      id              INTEGER PRIMARY KEY,
      name            TEXT NOT NULL,
      short_name      TEXT NOT NULL,
      country_code    TEXT NOT NULL DEFAULT '',
      group_id        TEXT NOT NULL,
      is_placeholder  INTEGER NOT NULL DEFAULT 0,
      external_id     TEXT
    );

    CREATE TABLE IF NOT EXISTS match (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
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
      prob_first      REAL NOT NULL DEFAULT 0,
      prob_second     REAL NOT NULL DEFAULT 0,
      prob_third      REAL NOT NULL DEFAULT 0,
      prob_third_qual REAL NOT NULL DEFAULT 0,
      prob_out        REAL NOT NULL DEFAULT 0,
      scenarios_json  TEXT,
      calculated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      scraped_at      TEXT NOT NULL DEFAULT (datetime('now')),
      source          TEXT,
      matches_updated INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL,
      error_message   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_match_group ON match(group_id);
    CREATE INDEX IF NOT EXISTS idx_match_status ON match(status);
    CREATE INDEX IF NOT EXISTS idx_team_group ON team(group_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
