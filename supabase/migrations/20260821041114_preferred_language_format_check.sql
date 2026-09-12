-- The only genuinely-missing piece of 20261024_preferred_language.sql: the
-- column itself already exists (applied earlier under a different tracked
-- migration name, "profile_preferred_language"), but the format-guard CHECK
-- constraint was never added. Verified no existing row violates it before
-- applying. ADD COLUMN is IF NOT EXISTS (no-op here) and the constraint
-- swap is DROP IF EXISTS + ADD, both idempotent.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_language_format;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_language_format
  CHECK (preferred_language = 'auto' OR preferred_language ~ '^[a-z]{2}$');
