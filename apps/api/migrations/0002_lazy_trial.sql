-- The free trial starts on the first Cloud call, not at sign-in (D24). Remember the outcome per
-- account so a refusal isn't re-checked on every call: granted, device_limit, account_too_new
-- (final) or network_limit (retried on a later UTC day).
ALTER TABLE users ADD COLUMN trial_status TEXT;
ALTER TABLE users ADD COLUMN trial_checked_day TEXT;
