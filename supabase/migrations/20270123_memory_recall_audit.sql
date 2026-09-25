-- 20270122_memory_recall_audit.sql
--
-- Production has real retrieval correctness (pgvector similarity search,
-- memory-arbiter.ts's conflict resolution) but no closed loop verifying the
-- MODEL actually used what was retrieved correctly once it reached the
-- prompt — no signal distinguishing "recalled it right," "ignored it," or
-- "confabulated a detail that contradicts it." This table is that loop's
-- storage: one row per assistant turn that had memory context available,
-- capturing exactly what was shown (memory_ids — the same IDs
-- formatMemoryGraphForPrompt() actually rendered, not just what was
-- fetched) alongside the reply, for a sampled judge pass to grade after
-- the fact (see src/lib/ai/memory-recall-grader.ts +
-- api/cron/recall-accuracy-audit).
--
-- Deliberately NOT on the hot path: written fire-and-forget after fullReply
-- is already finalized (same point messages.insert() for the assistant row
-- happens), graded later by a low-frequency cron — same tier as
-- embedding-backfill. A failure to write or grade a row never touches the
-- chat reply.
--
-- RLS: admin-read only, following the crisis_events precedent (see
-- 20260829_crisis_events_admin_access.sql's own postmortem — that table's
-- first RLS policy gated read access behind a role nobody had ever been
-- assigned, making it write-only and invisible for weeks). Going straight
-- to "admin OR is_admin = TRUE" here rather than repeating that mistake.

CREATE TABLE IF NOT EXISTS memory_recall_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_id      UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- The exact memory_graph.id set actually rendered into the prompt this
  -- turn (formatMemoryGraphForPrompt()'s top-8 slice of semanticMemoryGraph,
  -- not the wider candidate pool) — the grader re-fetches these by id
  -- rather than trusting a copy of their text, so edits/archival between
  -- write and grading are reflected automatically.
  memory_ids        UUID[] NOT NULL DEFAULT '{}',

  -- How many topic-level conflicts memory-arbiter.ts resolved while
  -- assembling this turn's fact block (companionContext.canonicalMemory.
  -- conflicts.length) — zero cost to capture here, and a turn with active
  -- conflicts is exactly the kind of turn worth weighting higher in
  -- sampling (see memory-recall-grader.ts's SAMPLE query), since that's
  -- where confabulation risk concentrates.
  fact_conflict_count SMALLINT NOT NULL DEFAULT 0,

  user_message      TEXT NOT NULL,
  assistant_reply   TEXT NOT NULL,

  grading_status    TEXT NOT NULL DEFAULT 'pending'
                     CHECK (grading_status IN ('pending', 'graded', 'skipped')),
  -- 'skipped' covers rows the grader intentionally didn't score — e.g.
  -- memory_ids ended up empty by the time this ran (all referenced memories
  -- were archived/deleted between write and grading), not a judge failure.
  verdict           TEXT
                     CHECK (verdict IN ('consistent', 'contradicted', 'unverifiable')),
  verdict_reasoning TEXT,
  graded_at         TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cron's sampling query: oldest pending rows first, optionally weighted by
-- fact_conflict_count — see memory-recall-grader.ts.
CREATE INDEX IF NOT EXISTS idx_recall_audit_pending
  ON memory_recall_audit (grading_status, created_at)
  WHERE grading_status = 'pending';

-- Admin reporting: pass-rate over time, per character.
CREATE INDEX IF NOT EXISTS idx_recall_audit_character_graded
  ON memory_recall_audit (character_id, graded_at)
  WHERE grading_status = 'graded';

ALTER TABLE memory_recall_audit ENABLE ROW LEVEL SECURITY;

-- is_admin() is this repo's own established helper (20240101_production.sql)
-- for exactly this check — using it here instead of re-deriving the
-- role/is_admin OR clause inline keeps this policy identical in behavior to
-- profiles_admin_read and every other admin-gated table, and means a future
-- change to what "admin" means only has to happen in one place.
DROP POLICY IF EXISTS "recall_audit_admin_select" ON memory_recall_audit;
CREATE POLICY "recall_audit_admin_select" ON memory_recall_audit
  FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "recall_audit_service_write" ON memory_recall_audit;
CREATE POLICY "recall_audit_service_write" ON memory_recall_audit
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE memory_recall_audit IS
  'Sampled ground-truth log pairing a turn''s injected memory (by id, '
  're-fetched fresh at grading time) with the actual reply, graded by '
  'src/lib/ai/memory-recall-grader.ts for contradiction/confabulation. '
  'Admin-visible via /api/admin/recall-accuracy. Not a gate — purely '
  'observability, written after the reply is already sent.';
