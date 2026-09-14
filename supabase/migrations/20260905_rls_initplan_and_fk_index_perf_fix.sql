-- Performance fix (2026-09-05 cost/speed audit), applied directly to prod
-- (project jepjpwkgabqimwiqwabk) — this file mirrors that change for the repo.
--
-- 1) auth_rls_initplan: Postgres was re-evaluating auth.uid() once per row
--    scanned instead of once per query. Wrapping it in (select ...) lets the
--    planner treat it as a stable subquery result instead of a per-row call.
--    - token_ledger_own_read: hit on every chat cost-guard read (cost-guard.ts
--      -> spending-cap.ts checks read from this table on the hot chat path).
--    - posts_public_read: hit on every character_posts feed read.
--
-- 2) unindexed_foreign_keys: social_posts had 3 FK columns with no covering
--    index, which slows down joins/deletes involving those columns.

DROP POLICY IF EXISTS "token_ledger_own_read" ON token_ledger;
CREATE POLICY "token_ledger_own_read" ON token_ledger
  FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "posts_public_read" ON character_posts;
CREATE POLICY "posts_public_read" ON character_posts
  FOR SELECT
  USING (target_user_id IS NULL OR target_user_id = (select auth.uid()));

CREATE INDEX IF NOT EXISTS idx_social_posts_created_by
  ON social_posts (created_by);

CREATE INDEX IF NOT EXISTS idx_social_posts_reviewed_by
  ON social_posts (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_social_posts_source_post_id
  ON social_posts (source_post_id);
