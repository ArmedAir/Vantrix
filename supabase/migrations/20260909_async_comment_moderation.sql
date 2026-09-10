-- Async post-publish moderation for feed comments
--
-- BACKGROUND: /api/feed/posts/[id]/comments POST previously ran the full
-- moderateCharacter() gate (sync keyword blocklist + a blocking AI call)
-- before ever inserting a comment. Every comment, no matter how benign,
-- paid the AI call's latency and — critically — its failure mode: if the
-- AI layer's call failed on both the pinned attempt and the failover
-- attempt (bad/rate-limited key, provider outage, etc.), moderateCharacter()
-- fails closed and the route rejected the comment outright with
-- 'Content review is temporarily unavailable.' Since this ran identically
-- for every comment platform-wide, a single AI-layer outage looked to
-- users like commenting itself was broken.
--
-- FIX: decouple the two layers per call site, not in moderateCharacter()
-- itself (other callers of that function — character creation, community
-- posts — are unchanged and keep their existing pre-publish blocking
-- behavior; this migration only adds what the feed-comments route needs
-- to publish-then-review instead).
--
--   1. The synchronous keyword blocklist (minors, sexual violence, hate,
--      real-world-harm instructions, exploitation) still runs before
--      insert and still hard-rejects instantly. That never changes and
--      does not depend on any external service.
--   2. The AI nuance layer (spam, borderline calls, "adult romance vs.
--      actually-disallowed" judgment) moves to run AFTER the comment is
--      already inserted and visible. moderation_status starts 'pending'
--      and is flipped to 'approved' or 'rejected' once the async check
--      resolves — see runAsyncCommentReview() in @/lib/moderation.
--   3. If the AI layer is unavailable on both attempts, that is no longer
--      treated as a rejection: the comment stays visible ('pending') and
--      a moderation_holds row is queued for manual admin review instead
--      of erroring out the user who did nothing wrong.
--
-- Comments only ever disappear from the public GET query once
-- moderation_status is explicitly set to 'rejected' — by the async AI
-- check, or by an admin acting on a queued hold.

ALTER TABLE character_post_comments
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

COMMENT ON COLUMN character_post_comments.moderation_status IS
  'pending: published, awaiting async AI review or manual review (still visible). '
  'approved: AI review or an admin confirmed it is fine. '
  'rejected: AI review or an admin pulled it — excluded from the public GET query.';

-- Only the 'rejected' state changes query behavior (public GET excludes
-- it); this partial index keeps that lookup cheap without indexing the
-- much larger pending/approved majority.
CREATE INDEX IF NOT EXISTS idx_post_comments_rejected
  ON character_post_comments (post_id)
  WHERE moderation_status = 'rejected';

-- ── Link moderation_holds to a live, already-published row ────────────────
--
-- Every existing use of moderation_holds (keyword_watchlist's
-- hold_for_review action) is a PRE-publish block: the original request
-- was already rejected back to the caller before any DB write, so there
-- was nothing live to reference — see this table's original migration
-- comment ("approving a hold here ... does not automatically re-run the
-- original request").
--
-- The new async-comment-review flow is the opposite shape: the comment
-- is already published when a hold is created for it (either because the
-- AI check actually rejected it, or because the AI layer was unavailable
-- and it needs a human look). comment_id lets the admin PATCH route
-- cascade the reviewer's decision straight onto the live row — approve
-- restores/confirms visibility, reject pulls it — instead of only
-- recording an audit trail with no visible effect, which is what would
-- happen if this reused the table as-is. Nullable and unrelated to the
-- pre-publish keyword-hold rows, which continue to leave this null.
ALTER TABLE moderation_holds
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES character_post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_moderation_holds_comment
  ON moderation_holds (comment_id) WHERE comment_id IS NOT NULL;
