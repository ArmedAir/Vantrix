-- ONBOARDING-GENDER-LOCK perf follow-up.
--
-- getOnboardingCharacterPool() (src/lib/seo/public-character.ts) now adds
-- `.eq("gender", "female")` on top of the existing five-clause public-row
-- filter (active, is_public, is_live, moderation_status, is_nsfw), then
-- orders by like_count. Without a matching index, Postgres has to walk
-- every row satisfying the boolean/status filters and sort them before
-- gender narrows anything down — fine at today's character count, but a
-- sequential-scan-and-sort that gets linearly worse as the catalog grows,
-- on a route that's hit by every anonymous pre-signup visitor.
--
-- Partial + covering: WHERE clause matches the four boolean/status
-- predicates that are always true for a "public" row (is_nsfw stays out
-- of the predicate since onboarding is the only caller that always wants
-- it false — encoding it here would silently make this index unusable
-- for a future public-NSFW-inclusive caller), gender and like_count as
-- the index's own leading/sort columns so both the .eq("gender", ...)
-- filter and the ORDER BY like_count DESC are satisfied directly from
-- the index without a separate sort step.
CREATE INDEX IF NOT EXISTS idx_characters_onboarding_gender_pool
  ON characters (gender, like_count DESC)
  WHERE active = true
    AND is_public = true
    AND is_live = true
    AND moderation_status = 'approved';
