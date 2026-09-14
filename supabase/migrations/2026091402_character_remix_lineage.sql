-- Community remix support.
--
-- Vantrix's creation studio (creation-studio.tsx) is a deep from-scratch
-- wizard, but every entry point started from emptyDraft() — there was no
-- way to build on another creator's *public* character the way Candy
-- AI's community does. This is the backend half of that: lineage tracking
-- (who a character was remixed from, and how many times it's been
-- remixed) plus the increment RPC the remix-seed route calls.
--
-- Deliberately NOT copying the original's visual_seed/lora_model_id when
-- a remix is created (see src/lib/characters/remix.ts) — this column
-- exists purely for attribution/lineage display and remix-count social
-- proof, not to let a remix render with the original's exact locked face.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS remixed_from_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remix_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_characters_remixed_from ON characters(remixed_from_character_id)
  WHERE remixed_from_character_id IS NOT NULL;

-- Atomic increment, called (best-effort, fire-and-forget) from
-- GET /api/characters/:id/remix-seed whenever someone starts a remix —
-- counted at "started customizing," not at publish, matching how
-- like_count/follower_count elsewhere in this schema count engagement
-- rather than completed funnels.
CREATE OR REPLACE FUNCTION increment_character_remix_count(p_character_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE characters SET remix_count = remix_count + 1 WHERE id = p_character_id;
$$;
