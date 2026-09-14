-- 20260905_achievement_feed_posts.sql
--
-- ACHIEVEMENT FEED POSTS — closing the Kindroid-parity gap where every
-- relationship milestone Vantrix already computes (streak-rewards-engine.ts,
-- relationship-engine.ts's checkAndApplyExtraMilestones/addRelationshipXp)
-- was only ever surfaced two ways: an in-chat toast (character_surprises)
-- that disappears, or an OG share-card (viral-share.ts) the user has to
-- manually request to post *outside* Vantrix. Neither one is a post
-- *inside* Vantrix's own social feed — the single place this platform
-- already asks users to check daily. Kindroid Social's own architecture
-- treats a companion's feed as the living record of the relationship, not
-- just a content strip; this migration is what lets ours do the same.
--
-- target_user_id is the key addition: NULL means "public, everyone's feed"
-- (every existing row, plus all future autonomous/creator posts — no
-- behavior change for them). Set means "this post belongs to one specific
-- relationship" — visible only to that user, never in the shared new/
-- trending/all cache, always in that user's own feed regardless of whether
-- they formally follow the character. A user's private milestone with a
-- companion is exactly the kind of thing that should never leak onto a
-- public discovery surface, so this is enforced at the RLS layer, not just
-- in application-code query filters (see lib/feed/get-posts.ts).

ALTER TABLE character_posts
  DROP CONSTRAINT IF EXISTS character_posts_post_type_check;

ALTER TABLE character_posts
  ADD CONSTRAINT character_posts_post_type_check
  CHECK (post_type IN ('photo', 'text', 'teaser', 'achievement'));

ALTER TABLE character_posts
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS milestone_data JSONB;

-- An achievement post without a target is meaningless (whose milestone is
-- it?), and a targeted post that isn't an achievement would silently make
-- an otherwise-public post private by accident. Tying the two together at
-- the DB layer means a future bug in the insert path fails loudly instead
-- of quietly leaking a private post into the public feed or vice versa.
ALTER TABLE character_posts
  ADD CONSTRAINT character_posts_achievement_target_consistency
  CHECK (
    (post_type = 'achievement' AND target_user_id IS NOT NULL) OR
    (post_type != 'achievement' AND target_user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_character_posts_target_user
  ON character_posts (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- RLS: the previous "posts_public_read USING (TRUE)" policy predates any
-- notion of a private/targeted post and would otherwise expose every
-- user's relationship milestones to any authenticated (or anon, if ever
-- queried that way) client. supabaseAdmin (service_role) already bypasses
-- RLS entirely via posts_service below, so this only changes what the
-- anon/authenticated key can see — defense in depth alongside the
-- application-layer filtering in lib/feed/get-posts.ts, not a replacement
-- for it.
DROP POLICY IF EXISTS "posts_public_read" ON character_posts;
CREATE POLICY "posts_public_read" ON character_posts
  FOR SELECT
  USING (target_user_id IS NULL OR target_user_id = auth.uid());

COMMENT ON COLUMN character_posts.target_user_id IS
  'Set only for post_type = achievement. The one user this milestone post is visible to — never shown on the public/trending feed or any other user''s following feed.';
COMMENT ON COLUMN character_posts.milestone_data IS
  'For post_type = achievement: { milestoneKey, milestoneLabel, milestoneEmoji, streakDays, bondScore }. Mirrors the shape viral-share.ts''s createMilestoneCard already uses so both surfaces read from the same vocabulary.';
