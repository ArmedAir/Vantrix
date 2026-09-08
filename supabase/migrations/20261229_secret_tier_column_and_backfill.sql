-- Adds a machine-readable `tier` column to character_seed_memories and
-- backfills it for every existing 'secret'-category row.
--
-- WHY THIS EXISTS (real bug, not a style nit)
-- secret-tier-engine.ts computes which secret tiers a user has *earned*
-- (known/hidden/dark/catastrophic, gated by relationship stage +
-- unlockSecretTier) and formatSecretTierForPrompt() injects an instruction
-- like "you may discuss X, do not reveal Y yet." But the actual secret
-- CONTENT lives in character_seed_memories with only a free-text `headline`
-- ('Dark Secret', 'Hidden Secret', ...) -- nothing machine-readable ties a
-- row to a SecretTier. getCharacterSeedMemories() fetches the top 8 rows by
-- importance with no tier filter at all, and prompt.ts injects every one of
-- them into the "Foundational Memories" section unconditionally. Dark
-- secrets carry the highest importance value in the whole seed-memory
-- system (90), so in practice a character's dark secret is visible to the
-- model from message one of a stranger conversation -- the "gate" is
-- advisory text sitting next to the content it's supposed to be gating.
-- This directly undermines the tiered-secret-reveal mechanic (see
-- secret-tier-engine.ts's own "Withheld Information as the Engine" framing)
-- which is a core relationship-progression/retention driver.
--
-- This migration only adds the data plumbing (column + backfill). The
-- actual filtering fix is in src/lib/ai/character-seed-memory.ts and
-- src/lib/ai/prompt.ts (application code, not SQL).

BEGIN;

ALTER TABLE character_seed_memories
  ADD COLUMN IF NOT EXISTS tier TEXT
    CHECK (tier IS NULL OR tier IN ('known', 'hidden', 'dark', 'catastrophic'));

COMMENT ON COLUMN character_seed_memories.tier IS
  'Machine-readable secret tier for category=''secret'' rows (known/hidden/dark/catastrophic), '
  'matching SecretTier in src/types/roleplay-system.ts. NULL for all non-secret categories '
  '(psychology, romance, speech, relationship_stages, memory_system, rivals, etc). '
  'Used by getAccessibleSeedMemories() to filter out locked-tier secrets before prompt injection '
  '-- see 20261229_secret_tier_column_and_backfill.sql for why this exists.';

-- Backfill every existing secret-category row across the whole table
-- (Archive of Echoes characters + core10), inferring tier from the
-- headline convention already used consistently everywhere: 'Known Secret',
-- 'Hidden Secret', 'Dark Secret', 'Catastrophic Secret'. This covers rows
-- written before this column existed; the new canon-7 migration
-- (20261230_seed_and_deepen_canon7_characters.sql) sets tier explicitly on
-- insert and doesn't rely on this backfill.
UPDATE character_seed_memories
SET tier = 'known'
WHERE category = 'secret' AND tier IS NULL AND headline ILIKE '%known%';

UPDATE character_seed_memories
SET tier = 'hidden'
WHERE category = 'secret' AND tier IS NULL AND headline ILIKE '%hidden%';

UPDATE character_seed_memories
SET tier = 'dark'
WHERE category = 'secret' AND tier IS NULL AND headline ILIKE '%dark%';

UPDATE character_seed_memories
SET tier = 'catastrophic'
WHERE category = 'secret' AND tier IS NULL AND headline ILIKE '%catastrophic%';

-- Anything still NULL after the pass above is a secret-category row whose
-- headline didn't match the convention (a custom creator-authored secret,
-- most likely). Defaulting these to 'known' is the safe failure direction:
-- it means the row stays visible under the *least* trust rather than
-- silently disappearing from every conversation, and rather than silently
-- staying leaked at full visibility like today.
UPDATE character_seed_memories
SET tier = 'known'
WHERE category = 'secret' AND tier IS NULL;

COMMIT;
