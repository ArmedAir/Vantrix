-- Backfill the 8 profiles that inherited the buggy 'en' default (see
-- fix_preferred_language_default) to the intended 'auto' (per-conversation
-- auto-detect). Scoped to rows still at the column's original default —
-- if any of the 8 had also set a different explicit non-'en' value since,
-- this WHERE clause still only touches 'en' rows, which is all of them per
-- the pre-fix count (8 'en', 1 'es' — 'es' is untouched).
UPDATE profiles
SET preferred_language = 'auto'
WHERE preferred_language = 'en';
