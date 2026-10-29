-- D25: free-trial runs write with muse-spark-1.3-contributor. Metered at the standard rate until
-- Meta's console confirms the contributor price; lower these two rows then (micro$ per token).
INSERT OR IGNORE INTO settings (key, value) VALUES ('price_trial_input', '1.25');
INSERT OR IGNORE INTO settings (key, value) VALUES ('price_trial_output', '4.25');
