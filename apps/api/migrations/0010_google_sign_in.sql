-- Google sign-in, next to GitHub. A Google account has no github_id or github_login.
ALTER TABLE users ADD COLUMN google_id TEXT;
CREATE UNIQUE INDEX users_google_id ON users (google_id);

-- Both providers vouch for an address, so the same person lands on one account: one wallet, one plan.
CREATE INDEX users_email_lower ON users (lower(email));
