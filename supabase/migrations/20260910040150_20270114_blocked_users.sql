CREATE TABLE IF NOT EXISTS blocked_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users (blocker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users (blocked_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocked_users_owner_all
  ON blocked_users
  FOR ALL
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

COMMENT ON TABLE blocked_users IS
  'User-to-user content block, enforced application-side by filtering community_posts/community_replies queries on author_id (see src/lib/social/blocks.ts). Not a full account-level block (chat/dating/matching are unaffected) — scoped to community content, the one surface where blocking has real meaning today.';

