-- Automated email (D32). An email waits here, so sign-in and payment never depend on it being sent.
-- The primary key is what stops duplicates: 'welcome:<user>' and 'pro:<user>' can only exist once.
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL,                     -- welcome | pro
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | skipped (no address) | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX email_outbox_queue ON email_outbox (status, created_at);
CREATE INDEX email_outbox_sent ON email_outbox (sent_at);
