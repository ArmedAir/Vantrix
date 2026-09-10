-- Hardening pass on top of 20260909_async_comment_moderation.sql.
--
-- 1. moderation_holds.post_id — the admin holds panel could only show a
--    comment hold's `excerpt`, with no way to jump to the actual post/
--    thread it belongs to without opening submitted_payload's JSON by
--    hand. post_id was already present in submitted_payload but not
--    queryable/indexable as a real column. Backfilled from the existing
--    JSONB payload for any rows already written by the async-review flow.
--
-- 2. idx_post_comments_pending_created — supports the new
--    comment-moderation-sweep cron (sweepStalePendingComments() in
--    @/lib/moderation), which scans for comments still 'pending' past a
--    grace window because the original after() review task never ran
--    (function killed/timed out before it fired — a gap the async-review
--    function itself cannot retry its way out of, since nothing else
--    would ever call it again). Without this index that scan is a full
--    table scan filtered on the (currently unindexed) common case status.
ALTER TABLE moderation_holds
  ADD COLUMN IF NOT EXISTS post_id UUID;

CREATE INDEX IF NOT EXISTS idx_moderation_holds_post
  ON moderation_holds (post_id) WHERE post_id IS NOT NULL;

UPDATE moderation_holds
SET post_id = (submitted_payload ->> 'postId')::UUID
WHERE post_id IS NULL
  AND comment_id IS NOT NULL
  AND submitted_payload ->> 'postId' IS NOT NULL;

COMMENT ON COLUMN moderation_holds.post_id IS
  'Set only for post-publish holds (async feed-comment review) — same '
  'scope as comment_id. Lets the admin panel link straight to the post '
  'without unpacking submitted_payload JSON.';

CREATE INDEX IF NOT EXISTS idx_post_comments_pending_created
  ON character_post_comments (created_at)
  WHERE moderation_status = 'pending';
