-- Removes redundant permissive policies flagged by the linter (84 warnings
-- collapsing to 14 real table/action overlaps across 6 evaluator roles).
-- Verified in a rolled-back transaction first: anon-visible row count on
-- `characters` was 65 before and after this change.

-- 1. Dead policies: service_role has rolbypassrls=true, so a policy gated on
--    auth.role()='service_role' never fires for real service_role connections
--    (RLS is skipped outright) and never fires for anon/authenticated either.
drop policy memory_tests_service_write on character_memory_tests;
drop policy post_comments_service_write on character_post_comments;
drop policy char_post_likes_service_write on character_post_likes;
drop policy secret_unlocks_service_write on character_secret_unlocks;
drop policy companion_relationships_service_write on companion_relationships;
drop policy universe_scenes_service_write on universe_scenes;

-- 2. age_verifications: split the "no writes" ALL policy so it stops
--    double-covering SELECT
drop policy "No client writes to verification" on age_verifications;
create policy age_verifications_no_insert on age_verifications for insert with check (false);
create policy age_verifications_no_update on age_verifications for update using (false);
create policy age_verifications_no_delete on age_verifications for delete using (false);

-- 3. app_config: same split for config_admin
drop policy config_admin on app_config;
create policy config_admin_insert on app_config for insert with check (is_admin());
create policy config_admin_update on app_config for update using (is_admin()) with check (is_admin());
create policy config_admin_delete on app_config for delete using (is_admin());

-- 4. character_seed_memories: split owner_all + merge the two SELECT policies
drop policy character_seed_memories_owner_all on character_seed_memories;
drop policy character_seed_memories_public_read on character_seed_memories;
create policy character_seed_memories_owner_insert on character_seed_memories for insert with check (creator_id = (select auth.uid()));
create policy character_seed_memories_owner_update on character_seed_memories for update using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));
create policy character_seed_memories_owner_delete on character_seed_memories for delete using (creator_id = (select auth.uid()));
create policy character_seed_memories_select on character_seed_memories for select using (
  (creator_id = (select auth.uid()))
  or exists (select 1 from characters c where c.id = character_seed_memories.character_id and c.is_public = true and c.moderation_status = 'approved')
);

-- 5. characters: split characters_own_write + merge the two SELECT policies
drop policy characters_own_write on characters;
drop policy characters_read on characters;
create policy characters_owner_insert on characters for insert with check ((select auth.uid()) = creator_id or is_admin());
create policy characters_owner_update on characters for update using ((select auth.uid()) = creator_id or is_admin()) with check ((select auth.uid()) = creator_id or is_admin());
create policy characters_owner_delete on characters for delete using ((select auth.uid()) = creator_id or is_admin());
create policy characters_select on characters for select using (
  ((select auth.uid()) = creator_id or is_admin())
  or (active = true and moderation_status = 'approved' and is_public = true)
);

-- 6. user_reports: split reports_admin_read + merge SELECT/INSERT
drop policy reports_admin_read on user_reports;
drop policy reports_own_insert on user_reports;
drop policy reports_own_read on user_reports;
create policy reports_select on user_reports for select using (is_admin() or (select auth.uid()) = reporter_id);
create policy reports_insert on user_reports for insert with check (is_admin() or (select auth.uid()) = reporter_id);
create policy reports_update on user_reports for update using (is_admin()) with check (is_admin());
create policy reports_delete on user_reports for delete using (is_admin());
