-- iVibe Cloud: accounts, sessions, the free trial and the money ledger (docs/architecture.md §6.5).
-- All money is in micro-dollars (1,000,000 = $1) of Meta usage. Users see credits: 1 credit = 1 cent.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id TEXT UNIQUE,
  github_login TEXT,
  email TEXT,
  name TEXT,
  github_created_at INTEGER,       -- brand-new GitHub accounts don't get the free trial
  created_at INTEGER NOT NULL
);

-- One wallet per user. The CHECKs are the guarantee: a balance never goes below zero and
-- reservations never exceed it, whatever the code does.
CREATE TABLE wallets (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  balance INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  CONSTRAINT wallet_funds CHECK (balance >= 0 AND held >= 0 AND held <= balance)
);

-- Append-only history of every change to a balance.
CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL,              -- grant | charge | adjust
  amount INTEGER NOT NULL,         -- signed change to balance
  ref TEXT,                        -- run id, grant source
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- One row per metered call: the reservation while it runs, the real cost once it's done.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL,              -- transcribe | dictate | prompt | fix
  day TEXT NOT NULL,               -- UTC day of the daily pool it was reserved from
  hold INTEGER NOT NULL,
  status TEXT NOT NULL,            -- held | settled | released
  cost INTEGER,                    -- what was charged
  actual_cost INTEGER,             -- what Meta's usage says it cost (can exceed hold; logged)
  usage TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX runs_open ON runs (status, created_at);
CREATE INDEX runs_user ON runs (user_id, created_at);

-- The day's total for everyone, so the free trial can't drain the Meta credits in one day.
CREATE TABLE daily_pool (
  day TEXT PRIMARY KEY,
  cap INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT pool_cap CHECK (used >= 0 AND held >= 0 AND used + held <= cap)
);

-- Who got the free trial, from which device and network. Hashed with a server secret: no raw
-- hardware IDs or IP addresses are stored.
CREATE TABLE trial_claims (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  device_hash TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX trial_claims_device ON trial_claims (device_hash);
CREATE INDEX trial_claims_network ON trial_claims (network_hash, day);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Desktop sign-in (PKCE): the browser leg stores the challenge, the app proves the verifier.
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE login_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Kill switches, limits and prices, changeable without a deploy:
--   npx wrangler d1 execute ivibe --remote --command "UPDATE settings SET value='0' WHERE key='cloud_enabled'"
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('cloud_enabled', '1'),
  ('trial_amount', '500000'),            -- $0.50 = 50 credits
  ('trial_per_device', '2'),             -- free trials ever from one computer
  ('trial_per_network_per_day', '2'),    -- free trials a day from one IP (/64 for IPv6)
  ('trial_min_github_age_days', '14'),   -- new GitHub accounts don't get a trial
  ('daily_cap', '7000000'),              -- $7 a day across all users
  -- Meta prices, in micro-dollars: per token for Spark (= $ per million tokens), per image for
  -- SAM, per audio second for Voice Transcribe ($0.18 an hour).
  ('price_spark_input', '1.25'),
  ('price_spark_cached', '0.15'),
  ('price_spark_output', '4.25'),
  ('price_sam_image', '2500'),
  ('price_asr_second', '50'),
  -- Reserved before each call: the most it can cost with the caps the engine sets.
  ('hold_fix', '100000'),
  ('hold_write', '15000');
