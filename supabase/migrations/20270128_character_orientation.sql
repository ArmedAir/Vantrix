-- ─────────────────────────────────────────────────────────────────────────────
-- characters.orientation — content-classification only, additive.
--
-- Purely a property of the CHARACTER, orthogonal to `gender` (which stays
-- exactly as-is: female/male/anime/other, CHECK untouched). A gay male
-- character is gender='male', orientation='gay'; a lesbian character is
-- gender='female', orientation='lesbian'; etc. Composed together at the
-- query layer (see /api/characters `orientation` param) rather than folded
-- into `gender` or the existing `category` column, both of which already
-- mean something else and would silently collide (`category` is what the
-- `/api/characters?category=` param filters gender by).
--
-- Deliberately NOT a user-level field anywhere in the schema. This column
-- exists only to power a content filter/tab in Discover. No user_* table
-- gets an orientation column, no analytics event logs a user viewing this
-- category, and nothing here feeds ad targeting or the X-automation
-- selection logic. See also: this must stay excluded from
-- digital_twin_profiles / character_twin_optins signal collection — that
-- system existed before this migration and reads user behavior across the
-- app, so the exclusion lives in application code (twin-signals.ts /
-- curator-logic.ts), not in the schema, but is called out here so it isn't
-- missed if either system is touched again later.
--
-- NULL = unset/not applicable (the default for the existing roster and for
-- any character where orientation isn't a meaningful axis, e.g. 'other'
-- gender or non-romantic characters). Deploy-order safe: reader fails open
-- (NULL just means "doesn't match any orientation filter"), so code may
-- ship before or after this migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS orientation TEXT
    CHECK (orientation IS NULL OR orientation IN ('straight', 'gay', 'lesbian', 'bi'));

-- Partial index: only rows that actually set it are indexed, since most of
-- the roster will stay NULL (orientation is opt-in-to-classify, not a
-- required field on every character).
CREATE INDEX IF NOT EXISTS characters_orientation_idx
  ON characters (orientation)
  WHERE orientation IS NOT NULL;
