-- Prompt now thinks at "low" and Fix at "high" (Spike S19), with output caps of 3,000 and 12,000
-- tokens. Reservations cover the new worst case: Fix ≈ 30k input + 12k output + 6 SAM boxes ≈ $0.10;
-- Prompt ≈ 5k input + 3k output ≈ $0.02.
UPDATE settings SET value = '120000' WHERE key = 'hold_fix';
UPDATE settings SET value = '25000' WHERE key = 'hold_write';
