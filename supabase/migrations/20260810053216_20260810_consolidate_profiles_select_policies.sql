-- Perf: profiles had two separate permissive SELECT policies
-- (profiles_admin_read, profiles_own_select). Postgres evaluates every
-- permissive policy per row for every query — profiles is the hottest
-- table in the app (auth, tier gating, nearly every page load), so this
-- was doubling the RLS cost on every read. Same access semantics,
-- combined into one policy.
DROP POLICY IF EXISTS profiles_admin_read ON profiles;
DROP POLICY IF EXISTS profiles_own_select ON profiles;

CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (
    (SELECT auth.uid()) = id
    OR is_admin()
  );

