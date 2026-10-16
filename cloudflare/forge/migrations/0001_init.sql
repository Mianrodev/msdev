-- Forge Demo storage (Cloudflare D1 / SQLite).
CREATE TABLE demos (
  slug          TEXT PRIMARY KEY,           -- the public link: /s/<slug>
  business_name TEXT NOT NULL,
  intake        TEXT NOT NULL,              -- JSON: what was typed in
  content       TEXT NOT NULL,              -- JSON: the words on every section
  written_by    TEXT NOT NULL,              -- 'ai' or 'draft'
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' or 'archived'
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX demos_status ON demos (status, created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
