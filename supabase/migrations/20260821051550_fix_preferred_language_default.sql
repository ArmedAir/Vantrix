-- DEFAULT-DRIFT-FIX (2026-08-21): profiles.preferred_language was added with
-- DEFAULT 'en', but the language-engine design (and the later
-- preferred_language_format_check migration, which explicitly allows the
-- 'auto' sentinel) intends 'auto' (per-conversation auto-detect) as the
-- default for new signups. IF NOT EXISTS on a repeat ADD COLUMN can't fix
-- an existing column's default, hence this standalone fix.
--
-- Scope: DEFAULT only, for new rows going forward. Deliberately NOT
-- backfilling the 8 existing 'en' profiles — there's no way to tell from
-- this column alone whether a user explicitly chose English or just
-- inherited the buggy default, and silently flipping a live user's
-- language setting is a product decision, not a schema fix.
ALTER TABLE profiles
  ALTER COLUMN preferred_language SET DEFAULT 'auto';
