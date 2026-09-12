-- Wrap auth.uid() in a scalar subquery so Postgres evaluates it once per
-- query (initplan) instead of once per row. Pure perf fix — USING/CHECK
-- semantics are unchanged since (select auth.uid()) = auth.uid() for a
-- given statement.

ALTER POLICY "character_status_views_owner_all" ON public.character_status_views
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "partners insert own" ON public.referral_partners
  WITH CHECK (((select auth.uid()) = user_id) AND (class = 'user'::text) AND (status = 'active'::text));

ALTER POLICY "roleplay_beats_owner_insert" ON public.roleplay_beats
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_beats_owner_select" ON public.roleplay_beats
  USING ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_scenario_votes_delete" ON public.roleplay_scenario_votes
  USING ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_scenario_votes_insert" ON public.roleplay_scenario_votes
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_scenario_votes_update" ON public.roleplay_scenario_votes
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_sessions_owner_insert" ON public.roleplay_sessions
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_sessions_owner_select" ON public.roleplay_sessions
  USING ((select auth.uid()) = user_id);

ALTER POLICY "roleplay_sessions_owner_update" ON public.roleplay_sessions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
