-- =============================================================================
-- Vantrix — Character three-state visibility (private / unlisted / public)
-- =============================================================================
--
-- Context: characters previously had a single `is_public` boolean, exposed
-- to creators as a binary Private/Public toggle. This adds a third state,
-- "Unlisted" — usable and reachable by anyone with the direct link once
-- approved, but excluded from the discover/dating feed. `is_public` is kept
-- as-is (it already means exactly "listed in the public feed") and is now
-- kept in sync with the new `visibility` column by trigger, so every
-- existing `.eq('is_public', true)` feed query keeps working unchanged.
--
-- Also fixes a real pre-existing gap: the `characters_read` RLS policy only
-- checked `active AND moderation_status = 'approved'` — it never checked
-- `is_public` at all. That meant a "private" character was, in practice,
-- readable by anyone who queried it directly by id via the anon/authed
-- Supabase client (bypassing app-level canView() checks), once it was
-- active + approved. This migration closes that gap at the database level:
-- private characters are now only readable by their creator or an admin.
-- =============================================================================

-- 1. New visibility column -------------------------------------------------
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_visibility_valid;
ALTER TABLE characters
  ADD CONSTRAINT characters_visibility_valid
  CHECK (visibility IN ('private', 'unlisted', 'public'));

-- 2. Backfill from is_public — preserves current state for existing rows ---
UPDATE characters
   SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END
 WHERE visibility = 'private'; -- only rows still at the column default

-- 3. Keep is_public and visibility in sync from either side ----------------
-- Lets legacy code paths that only know about is_public (e.g. the existing
-- admin PATCH route) keep working untouched, while new visibility-aware
-- code (creation wizard, the /visibility route) can use 'unlisted'.
CREATE OR REPLACE FUNCTION sync_character_visibility() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_public := (NEW.visibility = 'public');
    RETURN NEW;
  END IF;

  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    -- Caller changed visibility explicitly (possibly to 'unlisted') —
    -- is_public follows it.
    NEW.is_public := (NEW.visibility = 'public');
  ELSIF NEW.is_public IS DISTINCT FROM OLD.is_public THEN
    -- Caller changed only the legacy is_public column — collapse to
    -- public/private (a legacy writer can't express 'unlisted').
    NEW.visibility := CASE WHEN NEW.is_public THEN 'public' ELSE 'private' END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_character_visibility ON characters;
CREATE TRIGGER trg_sync_character_visibility
  BEFORE INSERT OR UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION sync_character_visibility();

-- 4. Invariant: never public/unlisted while inactive (extends the existing
--    is_public-only constraint from the prior migration to also cover the
--    new 'unlisted' state) -----------------------------------------------
ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_public_requires_active;
ALTER TABLE characters
  ADD CONSTRAINT characters_visibility_requires_active
  CHECK (visibility = 'private' OR active);

-- 5. Tighten characters_read RLS: private characters are no longer directly
--    readable by non-owners/non-admins, even once active + approved -------
DROP POLICY IF EXISTS "characters_read" ON characters;
CREATE POLICY "characters_read" ON characters FOR SELECT USING (
  (active = TRUE AND moderation_status = 'approved' AND visibility <> 'private')
  OR auth.uid() = creator_id
  OR is_admin()
);

-- 6. Supporting index for "my characters by visibility" queries ------------
CREATE INDEX IF NOT EXISTS idx_characters_creator_visibility
  ON characters (creator_id, visibility);

