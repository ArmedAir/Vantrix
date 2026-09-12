create or replace function bulk_update_neighborhood_cohesion(
  p_ids uuid[],
  p_cohesions numeric[]
)
returns void
language sql
as $$
  update neighborhoods n
  set cohesion = round(v.cohesion)::integer
  from unnest(p_ids, p_cohesions) as v(id, cohesion)
  where n.id = v.id;
$$;

comment on function bulk_update_neighborhood_cohesion is
  'Batched per-row cohesion write for tickCohesionDrift() — one unnest-joined UPDATE per cron tick instead of one UPDATE per neighborhood.';

grant execute on function public.bulk_update_neighborhood_cohesion(uuid[], numeric[]) to service_role;
