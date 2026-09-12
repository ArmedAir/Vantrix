-- 20260826000000_crisis_events
CREATE TABLE IF NOT EXISTS crisis_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  character_id     UUID REFERENCES characters(id) ON DELETE SET NULL,
  conversation_id  UUID,
  category         TEXT NOT NULL
                   CHECK (category IN ('suicidal_ideation', 'self_harm_intent', 'hopelessness_severe')),
  message_excerpt  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'reviewed_no_action', 'reviewed_followed_up', 'false_positive')),
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  reviewer_notes   TEXT
);
CREATE INDEX IF NOT EXISTS idx_crisis_events_status_created
  ON crisis_events (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crisis_events_user
  ON crisis_events (user_id) WHERE user_id IS NOT NULL;
ALTER TABLE crisis_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "safety_reviewer_read_crisis_events" ON crisis_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'safety_reviewer')
  );
CREATE POLICY "safety_reviewer_update_crisis_events" ON crisis_events
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'safety_reviewer')
  );

-- 20260826010000_reply_guard_flags
CREATE TABLE IF NOT EXISTS reply_guard_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  character_id     UUID REFERENCES characters(id) ON DELETE SET NULL,
  conversation_id  UUID,
  category         TEXT NOT NULL,
  blocked_excerpt  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'reviewed', 'false_positive')),
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  reviewer_notes   TEXT
);
CREATE INDEX IF NOT EXISTS idx_reply_guard_flags_status_created
  ON reply_guard_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reply_guard_flags_character
  ON reply_guard_flags (character_id) WHERE character_id IS NOT NULL;
ALTER TABLE reply_guard_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_reply_guard_flags" ON reply_guard_flags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
CREATE POLICY "admin_update_reply_guard_flags" ON reply_guard_flags
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- 20260828_backstory_engine_columns
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS backstory_expanded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backstory_expansion_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_characters_backstory_expanded_at
  ON characters (backstory_expanded_at NULLS FIRST)
  WHERE active = true;

-- 20260829_crisis_events_admin_access
DROP POLICY IF EXISTS "safety_reviewer_read_crisis_events"   ON crisis_events;
DROP POLICY IF EXISTS "safety_reviewer_update_crisis_events" ON crisis_events;

CREATE POLICY "safety_staff_read_crisis_events" ON crisis_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'safety_reviewer' OR profiles.role = 'admin' OR profiles.is_admin = TRUE)
    )
  );

CREATE POLICY "safety_staff_update_crisis_events" ON crisis_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role = 'safety_reviewer' OR profiles.role = 'admin' OR profiles.is_admin = TRUE)
    )
  );
