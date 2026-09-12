-- ─────────────────────────────────────────────────────────────────────────
-- memory_followups — powers the "you said you had that interview today,
-- how'd it go?" character-initiative trigger (src/lib/ai/memory-followup.ts).
--
-- Deliberately its own small table rather than adding columns to
-- memory_graph: this is a scheduling queue (has a due date, gets consumed
-- once), a different access pattern from memory_graph's append-only
-- recall log, and keeping it separate means a bug here can't touch the
-- core memory data the rest of the chat/memory system depends on.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_followups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  -- References the memory_graph row this was detected from — informational
  -- only (no FK; memory_graph rows may be pruned/archived independently and
  -- that should never block or cascade-delete a pending follow-up).
  source_id    UUID,
  event_text   TEXT        NOT NULL,
  due_at       TIMESTAMPTZ NOT NULL,
  delivered    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The cron's access pattern is always "due, undelivered rows for this
-- user+character pair, oldest first" — see getDueFollowUp().
CREATE INDEX IF NOT EXISTS idx_memory_followups_due
  ON memory_followups (user_id, character_id, due_at)
  WHERE delivered = FALSE;
ALTER TABLE memory_followups ENABLE ROW LEVEL SECURITY;
-- Users can read their own pending follow-ups (e.g. a future "what's on
-- their mind" debug/preview surface); all writes go through the service
-- role (scheduleFollowUpIfDetected / markFollowUpDelivered), never from
-- the client directly.
DROP POLICY IF EXISTS memory_followups_own_select ON memory_followups;
CREATE POLICY memory_followups_own_select ON memory_followups
  FOR SELECT USING (auth.uid() = user_id)
