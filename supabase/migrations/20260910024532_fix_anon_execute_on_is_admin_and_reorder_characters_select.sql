-- Fix: logged-out (anon) requests to any RLS-protected table whose policy
-- calls is_admin() -- most impactfully characters_select, which backs the
-- public homepage's Featured/Explore/Discover character reads -- were
-- hitting a hard Postgres 42501 "permission denied for function is_admin"
-- instead of the intended public-read fallback.
--
-- Root cause: is_admin(uuid) is STABLE SECURITY DEFINER and is called bare
-- (is_admin(), defaulting p_uid to auth.uid()) inside several tables' RLS
-- policies (characters, profiles, app_config, user_reports,
-- character_lora_jobs, storage.objects). SECURITY DEFINER only elevates
-- privileges *inside* the function body -- Postgres still requires the
-- role issuing the query (anon, for every logged-out visitor) to hold
-- EXECUTE on the function just to invoke it inside a USING/WITH CHECK
-- clause. anon never had that grant (authenticated did), even though past
-- migrations explicitly reasoned anon needed to keep it.
--
-- is_admin() is safe to grant to anon: it already internally guards
-- `p_uid = auth.uid() OR auth.role() = 'service_role'`, so an anon caller
-- (auth.uid() IS NULL) can only ever get `false` back -- no new exposure.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;

-- Defense in depth + perf: characters_select had is_admin() as the SECOND
-- OR branch, ahead of the cheap "ordinary public, approved, active
-- character" check. Postgres evaluates a flat OR left-to-right and
-- short-circuits on the first TRUE, so anon had to successfully call
-- is_admin() before ever reaching the branch covering the overwhelming
-- majority of homepage reads anyway. Reordering is a pure commutation of
-- the same three OR'd conditions (no behavior change) so the hot path
-- never touches is_admin() at all, and a future grant/role slip on
-- is_admin() can't take down public reads again.
DROP POLICY IF EXISTS characters_select ON public.characters;
CREATE POLICY characters_select ON public.characters
FOR SELECT
USING (
  (active = true AND moderation_status = 'approved' AND is_public = true)
  OR (SELECT auth.uid()) = creator_id
  OR is_admin()
);

