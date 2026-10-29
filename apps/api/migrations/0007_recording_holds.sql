-- One reservation per recording (Oct 29). A recording's live captions draw from a single hold
-- instead of reserving and settling one each, which queued D1 writes behind each other.
-- `used` is what a run has drawn or cost so far, written before the user gets a result, so a
-- settle that never runs still charges it (wallet.settleStale) instead of releasing it free.
ALTER TABLE runs ADD COLUMN used INTEGER NOT NULL DEFAULT 0;
