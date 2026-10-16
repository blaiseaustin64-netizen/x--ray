-- Cloudflare D1 schema for synced scan history.
-- Create + apply:
--   npx wrangler d1 create xray-db
--   npx wrangler d1 execute xray-db --remote --file=schema.sql
-- Then uncomment the [[d1_databases]] block in wrangler.toml.
--
-- user_id is whatever id your accounts backend returns from AUTH_VERIFY_URL.
-- Profiles/accounts themselves live in YOUR backend; this table only stores scans.

CREATE TABLE IF NOT EXISTS scans (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  host          TEXT NOT NULL,
  url           TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  verdict       TEXT,
  verdict_level TEXT,
  created_at    TEXT NOT NULL,
  report_json   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_user_time ON scans (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_user_host ON scans (user_id, host, created_at DESC);
