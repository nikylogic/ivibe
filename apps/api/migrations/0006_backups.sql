-- End-to-end encrypted backups for iVibe Pro (D28, §6.10). The objects live in R2
-- (ivibe-backups, users/<user id>/<name>); they are encrypted on the desktop with a key the server
-- never sees, so these rows only know names, sizes and times.

CREATE TABLE backups (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  key_check TEXT NOT NULL,                -- HMAC of a fixed label under the backup key: tells a wrong recovery key apart, reveals nothing
  bytes INTEGER NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  last_backup_at INTEGER,                 -- when the latest snapshot arrived
  delete_after INTEGER,                   -- set while Pro has ended: plan end + 90 days; cleared if Pro resumes
  created_at INTEGER NOT NULL
);
CREATE INDEX backups_delete_after ON backups (delete_after);

CREATE TABLE backup_objects (
  user_id TEXT NOT NULL REFERENCES backups (user_id),
  name TEXT NOT NULL,                     -- random, chosen by the desktop: "s-…" snapshots, "b-…" screenshots
  size INTEGER NOT NULL CHECK (size >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);
