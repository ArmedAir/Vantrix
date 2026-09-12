-- ─────────────────────────────────────────────────────────────────────────
-- Emotional Intelligence Engine — persistence for the two genuinely new
-- signals (emotional cycles, recurring insecurities). Everything else the
-- synthesis layer (src/lib/ai/eq-synthesis-engine.ts) reads already has a
-- home: love language from user_facts, relationship history from
-- memory_graph/character_relationships/dating_gifts.
-- ─────────────────────────────────────────────────────────────────────────

-- Append-only emotional time series. emotion-state.ts's Redis key only ever
-- holds the LAST state (6h TTL, by design — it's transition-model context,
-- not history). Detecting a *cycle* needs the history that was never kept
-- anywhere. Deliberately lightweight columns — this is a pattern-detection
-- input, not a full audit log; emotion-engine.ts's fuller EmotionalState
-- (secondary emotions, confidence) stays Redis-only.
CREATE TABLE IF NOT EXISTS emotion_snapshots (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  primary_emotion TEXT     NOT NULL,
  valence      REAL        NOT NULL, -- -1..1, mirrors EmotionalState.valence
  arousal      REAL        NOT NULL, -- 0..1
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Cycle detection always scopes to "this pair, recent window, oldest to
-- newest" — see getRecentSnapshots() in emotional-cycle-engine.ts.
CREATE INDEX IF NOT EXISTS idx_emotion_snapshots_pair_time
  ON emotion_snapshots (user_id, character_id, created_at DESC);
-- Prevent unbounded growth from a single hot pair — a maintenance sweep
-- (see the daily-reset cron's existing prune steps for the pattern) should
-- periodically delete rows older than ~120 days per pair; cycle detection
-- only ever looks at a ~90 day window anyway (EMOTION_CYCLE_WINDOW_DAYS).

ALTER TABLE emotion_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emotion_snapshots_own_select ON emotion_snapshots;
CREATE POLICY emotion_snapshots_own_select ON emotion_snapshots
  FOR SELECT USING (auth.uid() = user_id);
-- ─────────────────────────────────────────────────────────────────────────

-- Named, reinforced-over-time insecurities ABOUT THE USER (not the
-- character's own core-beliefs.ts, which is the opposite direction).
-- One row per (user, character, label) — reinforced_count increments
-- in place rather than inserting a new row per detection, so "recurring"
-- is a direct read of reinforced_count instead of a GROUP BY at query time.
CREATE TABLE IF NOT EXISTS user_insecurities (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id       UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  label              TEXT        NOT NULL, -- e.g. 'fear_of_abandonment', see INSECURITY_PATTERNS
  reinforced_count   INTEGER     NOT NULL DEFAULT 1,
  first_detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, character_id, label)
);
CREATE INDEX IF NOT EXISTS idx_user_insecurities_pair
  ON user_insecurities (user_id, character_id, last_reinforced_at DESC);
ALTER TABLE user_insecurities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_insecurities_own_select ON user_insecurities;
CREATE POLICY user_insecurities_own_select ON user_insecurities
  FOR SELECT USING (auth.uid() = user_id)
