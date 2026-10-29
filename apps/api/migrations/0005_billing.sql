-- iVibe Pro (D26): a monthly Dodo Payments subscription. Each paid month adds credits to the same
-- wallet; Dodo collects the money, our ledger stays the only balance (D9).

-- Whether a run counted against the free daily pool. Paid runs don't, so a busy trial day never
-- blocks a paying user.
ALTER TABLE runs ADD COLUMN pooled INTEGER NOT NULL DEFAULT 1;

-- Paid grants are looked up on every run (to choose the model and the pool).
CREATE INDEX ledger_user ON ledger (user_id, kind);

-- The latest known state of each Dodo subscription, from its webhooks.
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,                    -- Dodo subscription_id
  user_id TEXT NOT NULL REFERENCES users (id),
  customer_id TEXT NOT NULL,              -- for the customer portal
  product_id TEXT,
  status TEXT NOT NULL,                   -- pending | active | on_hold | paused | cancelled | failed | expired | past_due
  renews_at TEXT,                         -- next_billing_date
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  event_at INTEGER NOT NULL,              -- timestamp of the event applied last, so a late retry can't roll it back
  created_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_user ON subscriptions (user_id, event_at);

-- Every Dodo webhook seen, by its webhook-id, so a redelivery is applied once.
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('plan_product_id', ''),                -- Dodo product ID; empty keeps checkout off
  ('plan_amount', '4000000'),             -- $4.00 of usage (400 credits) per paid month
  ('plan_price_label', '$8/month');       -- shown in the app; the real price lives in Dodo
