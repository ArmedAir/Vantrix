create or replace function bulk_update_location_population(
  p_ids uuid[],
  p_populations numeric[]
)
returns void
language sql
set search_path = public
as $$
  update world_locations w
  set population = round(v.population)::integer
  from unnest(p_ids, p_populations) as v(id, population)
  where w.id = v.id;
$$;

comment on function bulk_update_location_population is
  'Batched per-row population write for tickMigration() — one unnest-joined UPDATE per cron tick instead of one UPDATE per moved location pair.';

grant execute on function public.bulk_update_location_population(uuid[], numeric[]) to service_role;
