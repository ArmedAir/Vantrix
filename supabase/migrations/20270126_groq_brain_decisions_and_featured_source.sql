-- ─────────────────────────────────────────────────────────────────────────────
-- Groq "brain" — decision audit log + AI-managed homepage hero slots.
--
-- 1. ai_brain_decisions: append-only log of every decision the brain layer
--    makes (homepage rotation today; X post ranking etc. next). Records the
--    mode it ran in, whether it was actually APPLIED, whether Groq or the
--    deterministic fallback produced it, and the full output — so "why is
--    this character on the homepage?" always has an answer, and shadow-mode
--    runs can be reviewed before anything is switched to live.
--
-- 2. characters.featured_source: who put a character in the homepage hero.
--    'manual' rows (admin-picked) are NEVER touched by the rotation job; only
--    'ai' rows are demoted/promoted by it. Existing featured characters are
--    backfilled to 'manual' so deploying this changes nothing on its own.
--    A featured character with featured_source IS NULL (e.g. featured later
--    through an admin UI that doesn't set it) is also treated as manual.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_brain_decisions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task           TEXT        NOT NULL,
  mode           TEXT        NOT NULL CHECK (mode IN ('shadow', 'live')),
  applied        BOOLEAN     NOT NULL DEFAULT FALSE,
  used_brain     BOOLEAN     NOT NULL DEFAULT FALSE,
  model          TEXT,
  input_summary  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  output         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_brain_decisions_task_idx
  ON ai_brain_decisions (task, created_at DESC);

ALTER TABLE ai_brain_decisions ENABLE ROW LEVEL SECURITY;

-- Admin/service-role only (same model as social_posts): no policy grants
-- anon/authenticated access; all reads/writes use supabaseAdmin.
DROP POLICY IF EXISTS "ai_brain_decisions_admin_only" ON ai_brain_decisions;
CREATE POLICY "ai_brain_decisions_admin_only" ON ai_brain_decisions FOR ALL USING (false);

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS featured_source TEXT
  CHECK (featured_source IN ('manual', 'ai'));

UPDATE characters
   SET featured_source = 'manual'
 WHERE is_featured = TRUE
   AND featured_source IS NULL;
