CREATE TABLE IF NOT EXISTS waitlist_submissions (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'email', 'messaging')),
  contact TEXT NOT NULL,
  email TEXT,
  messaging_contact TEXT,
  mode TEXT NOT NULL DEFAULT 'unknown',
  page_path TEXT,
  incentive TEXT NOT NULL DEFAULT 'founder_pricing',
  user_agent TEXT,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waitlist_submissions_created_at
  ON waitlist_submissions (created_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_submissions_channel
  ON waitlist_submissions (channel);

CREATE INDEX IF NOT EXISTS idx_waitlist_submissions_group_id
  ON waitlist_submissions (group_id);
