-- Schema for the self-hosted busuanzi-compatible counter.
-- Run this once in the Cloudflare dashboard: D1 database -> Console.

CREATE TABLE IF NOT EXISTS pv (
  page  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS site (
  id    TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO site (id, count) VALUES ('site_pv', 0);

-- One row per unique visitor (IP hash only, no raw addresses).
CREATE TABLE IF NOT EXISTS uv (
  ip TEXT PRIMARY KEY
);
