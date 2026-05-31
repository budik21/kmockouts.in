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

    -- Global tip-scoring recalculation status (singleton row, id = 1)
    CREATE TABLE IF NOT EXISTS tip_recalc_status (
      id                 INTEGER PRIMARY KEY DEFAULT 1,
      is_recalculating   BOOLEAN NOT NULL DEFAULT false,
      started_at         TIMESTAMPTZ,
      last_completed_at  TIMESTAMPTZ,
      CHECK (id = 1)
    );
    INSERT INTO tip_recalc_status (id) VALUES (1) ON CONFLICT DO NOTHING;

    -- AI-generation job queue. A match-update saves results + recalculates
    -- standings/tips synchronously (fast lane), then enqueues a row here. The
    -- standalone scraper process drains this queue (slow lane): it generates
    -- the group + team articles, best-third summaries, cross-group regen, and
    -- sends the tip-result e-mails — paced under the Anthropic rate limit and
    -- free of the web request's time budget.
    CREATE TABLE IF NOT EXISTS ai_generation_queue (
      id           SERIAL PRIMARY KEY,
      group_id     TEXT NOT NULL,
      match_id     INTEGER,
      -- True when THIS save transitioned the group from open to fully-decided;
      -- drives whether the slow lane runs the broader after-closure cross-group
      -- regen vs. the narrower 3rd-place-in-other-decided-groups refresh.
      just_closed  BOOLEAN NOT NULL DEFAULT false,
      status       TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | error
      attempts     INTEGER NOT NULL DEFAULT 0,
      claimed_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      last_error   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ai_queue_pending ON ai_generation_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_queue_group ON ai_generation_queue(group_id, status);

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

    -- Qualification threshold cache (what stats are needed for 8th place among best thirds)
    CREATE TABLE IF NOT EXISTS qualification_threshold_cache (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      threshold_json  TEXT NOT NULL,
      calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Feature flags (runtime-togglable switches managed in admin UI).
    -- Defaults are seeded below; updates go through /api/admin/feature-flags.
    CREATE TABLE IF NOT EXISTS feature_flag (
      key         TEXT PRIMARY KEY,
      enabled     BOOLEAN NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO feature_flag (key, enabled, description) VALUES
      ('ai_predictions', true, 'GENERATION: trigger Claude API calls to produce new AI-written qualification scenario summaries. Disabling skips API calls; it does NOT hide existing summaries — use ai_predictions_display for that.'),
      ('ai_predictions_display', true, 'DISPLAY: render cached AI-written summaries on team pages and best-third-placed standings. Disabling hides all AI commentary (deterministic fallback on team pages; best-third AI box is omitted). Generation is unaffected.')
    ON CONFLICT (key) DO NOTHING;

    -- Generic key/value app settings (string values). Used for admin-tunable
    -- knobs that don't fit the boolean feature_flag shape — e.g. which
    -- Claude model the AI predictions pipeline should call.
    CREATE TABLE IF NOT EXISTS app_setting (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO app_setting (key, value, description) VALUES
      ('ai_prediction_model', 'haiku', 'Which Claude model the AI predictions pipeline (team articles, group articles, scenario summaries, best-third summaries) calls. Allowed values: haiku, sonnet, opus.')
    ON CONFLICT (key) DO NOTHING;

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

    -- AI-generated group article cache (one article per group, synthesized
    -- from the per-team scenario summaries above + standings + remaining matches).
    CREATE TABLE IF NOT EXISTS ai_group_article_cache (
      group_id      TEXT PRIMARY KEY,
      headline      TEXT NOT NULL,
      lede          TEXT NOT NULL,
      body_html     TEXT NOT NULL,
      content_hash  TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- AI-generated team article cache (one article per team, written from
    -- that team's perspective answering "what does this team need to advance
    -- to the play-off"). Synthesized from the team's per-position scenario
    -- summaries + group standings + remaining matches.
    CREATE TABLE IF NOT EXISTS ai_team_article_cache (
      team_id       INTEGER PRIMARY KEY,
      group_id      TEXT NOT NULL,
      headline      TEXT NOT NULL,
      lede          TEXT NOT NULL,
      body_html     TEXT NOT NULL,
      content_hash  TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_team_article_cache_group ON ai_team_article_cache(group_id);

    -- One-shot data migration bookkeeping (each migration runs at most once).
    CREATE TABLE IF NOT EXISTS data_migration (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Tipovacka: registered users.
    -- tips_public defaults to TRUE so new players land on the global leaderboard
    -- out of the box. Pre-existing private rows were flipped once via the
    -- 'tips_public_default_2026_05_16' data migration below.
    CREATE TABLE IF NOT EXISTS tipster_user (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      image         TEXT NOT NULL DEFAULT '',
      share_token   TEXT UNIQUE,
      tips_public   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE tipster_user ALTER COLUMN tips_public SET DEFAULT TRUE;

    CREATE INDEX IF NOT EXISTS idx_tipster_user_share ON tipster_user(share_token);

    -- Email notification preferences. Exact-score notifications are on by
    -- default (the most satisfying scoring event); the others are opt-in.
    -- Pre-existing rows with exact-score off were flipped once via the
    -- 'notify_exact_score_default_2026_05_16' data migration below.
    ALTER TABLE tipster_user ADD COLUMN IF NOT EXISTS notify_exact_score BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE tipster_user ADD COLUMN IF NOT EXISTS notify_winner_only BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE tipster_user ADD COLUMN IF NOT EXISTS notify_wrong_tip   BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE tipster_user ALTER COLUMN notify_exact_score SET DEFAULT TRUE;

    -- Tipovacka: individual match predictions
    CREATE TABLE IF NOT EXISTS tip (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES tipster_user(id) ON DELETE CASCADE,
      match_id      INTEGER NOT NULL REFERENCES match(id) ON DELETE CASCADE,
      home_goals    INTEGER NOT NULL,
      away_goals    INTEGER NOT NULL,
      points        INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, match_id)
    );

    -- Set once when the first tip-result e-mail for this tip is sent. Lets the
    -- slow-lane dispatcher send exactly one e-mail per tip (first scoring) and
    -- stay idempotent across job retries — see dispatchTipResultEmailsForMatch.
    ALTER TABLE tip ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_tip_user ON tip(user_id);
    CREATE INDEX IF NOT EXISTS idx_tip_match ON tip(match_id);

    -- Tipovacka: user-created leagues (subgroups within the global ranking).
    -- Tips themselves are global (one set per user); a league is just a
    -- filtered standings view over its members.
    CREATE TABLE IF NOT EXISTS pickem_league (
      id              SERIAL PRIMARY KEY,
      code            CHAR(6) NOT NULL UNIQUE,
      name            VARCHAR(40) NOT NULL,
      name_normalized VARCHAR(40) NOT NULL UNIQUE,
      owner_user_id   INTEGER NOT NULL REFERENCES tipster_user(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pickem_league_owner ON pickem_league(owner_user_id);

    CREATE TABLE IF NOT EXISTS pickem_league_member (
      league_id  INTEGER NOT NULL REFERENCES pickem_league(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES tipster_user(id) ON DELETE CASCADE,
      joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (league_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pickem_league_member_user ON pickem_league_member(user_id);

    -- Pre-aggregated standings, rebuilt on tip recalc and on join/leave.
    CREATE TABLE IF NOT EXISTS pickem_league_standings (
      league_id      INTEGER NOT NULL REFERENCES pickem_league(id) ON DELETE CASCADE,
      user_id        INTEGER NOT NULL REFERENCES tipster_user(id) ON DELETE CASCADE,
      total_tips     INTEGER NOT NULL DEFAULT 0,
      exact_count    INTEGER NOT NULL DEFAULT 0,
      outcome_count  INTEGER NOT NULL DEFAULT 0,
      wrong_count    INTEGER NOT NULL DEFAULT 0,
      pending_count  INTEGER NOT NULL DEFAULT 0,
      total_points   INTEGER NOT NULL DEFAULT 0,
      rank           INTEGER NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (league_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pickem_league_standings_user ON pickem_league_standings(user_id);

    -- Twitter (X) posts published via this app. The Free tier of X API does
    -- NOT expose GET endpoints to read the account timeline, so we keep our
    -- own log to render history in the admin Twitter tab.
    CREATE TABLE IF NOT EXISTS twitter_post (
      id              SERIAL PRIMARY KEY,
      tweet_id        TEXT NOT NULL UNIQUE,
      text            TEXT NOT NULL,
      media_kind      TEXT,
      template        TEXT NOT NULL,
      team_id         INTEGER REFERENCES team(id),
      match_id        INTEGER REFERENCES match(id),
      posted_by_email TEXT NOT NULL,
      posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_twitter_post_posted_at ON twitter_post(posted_at DESC);
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

  // Flip pre-existing accounts to public once. New defaults make all signups
  // public; this catches accounts created before that change. Guarded by
  // data_migration so later opt-outs won't be re-flipped on subsequent deploys.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM data_migration WHERE name = 'tips_public_default_2026_05_16') THEN
        UPDATE tipster_user SET tips_public = TRUE WHERE tips_public = FALSE;
        INSERT INTO data_migration (name) VALUES ('tips_public_default_2026_05_16');
      END IF;
    END $$;
  `);

  // Turn exact-score notifications on for everyone once. New default is TRUE;
  // this catches accounts created before that change. Same guard so later
  // opt-outs are preserved.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM data_migration WHERE name = 'notify_exact_score_default_2026_05_16') THEN
        UPDATE tipster_user SET notify_exact_score = TRUE WHERE notify_exact_score = FALSE;
        INSERT INTO data_migration (name) VALUES ('notify_exact_score_default_2026_05_16');
      END IF;
    END $$;
  `);
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
