-- daily_world_choice_tallies and company_roster are both multi-relation/GROUP BY
-- views, so INSERT/UPDATE/DELETE/TRUNCATE are already inert at the engine level
-- (verified: Postgres rejects with "not automatically updatable"). Tightening
-- grants anyway to SELECT-only for anon/authenticated as defense-in-depth and
-- to remove unnecessary attack surface / linter noise.

revoke insert, update, delete, truncate, references, trigger
  on public.daily_world_choice_tallies
  from anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.company_roster
  from anon, authenticated;

grant select on public.daily_world_choice_tallies to anon, authenticated;
grant select on public.company_roster to anon, authenticated;
