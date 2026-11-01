-- Buying Pro on the website (D31): GitHub sign-in that ends in a browser cookie instead of the app.

-- What a GitHub sign-in is for: 'app' hands a code to the desktop app, 'web' continues to checkout.
ALTER TABLE oauth_states ADD COLUMN purpose TEXT NOT NULL DEFAULT 'app';

-- Separate from `sessions` on purpose: these can only buy or manage a plan, never run anything.
CREATE TABLE web_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX web_sessions_user ON web_sessions (user_id);
