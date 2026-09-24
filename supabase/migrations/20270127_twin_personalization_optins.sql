-- ─────────────────────────────────────────────────────────────────────────────
-- Digital Twin → personalization (both strictly OPT-IN, both default OFF).
--
-- 1. digital_twin_profiles.use_for_matching — user consents to their twin's
--    humor/values/tone signals nudging dating + "For You" ranking. Evaluated
--    entirely server-side by the deterministic scorer; twin data is never sent
--    to Groq or any LLM by this path.
--
-- 2. character_twin_optins — per (user, character) consent for that ONE
--    character to receive a lightweight style summary of the user in its chat
--    context ("let this character get to know how you talk"). No row = off.
--
-- Deploy-order safe: every reader fails open (no column / no table → feature
-- inert), so code may ship before or after this migration.
-- Additive only; nothing existing is altered or backfilled.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE digital_twin_profiles
  ADD COLUMN IF NOT EXISTS use_for_matching BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS character_twin_optins (
  user_id      UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id)
);

-- Reverse lookup (e.g. cleaning up when a character is removed is handled by
-- the FK cascade; this index serves "which characters has this user enabled").
CREATE INDEX IF NOT EXISTS character_twin_optins_character_idx
  ON character_twin_optins (character_id);

ALTER TABLE character_twin_optins ENABLE ROW LEVEL SECURITY;

-- Service-role only (same model as ai_brain_decisions): all reads/writes go
-- through the authenticated API routes using supabaseAdmin.
DROP POLICY IF EXISTS "character_twin_optins_service_only" ON character_twin_optins;
CREATE POLICY "character_twin_optins_service_only" ON character_twin_optins FOR ALL USING (false);
