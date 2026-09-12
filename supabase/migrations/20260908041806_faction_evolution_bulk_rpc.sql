create or replace function bulk_update_faction_influence(
  p_ids uuid[],
  p_influences numeric[]
)
returns void
language sql
as $$
  update factions f
  set influence = round(v.influence)::integer
  from unnest(p_ids, p_influences) as v(id, influence)
  where f.id = v.id;
$$;

comment on function bulk_update_faction_influence is
  'Batched per-row influence write for runFactionEvolution() — one unnest-joined UPDATE per cron tick instead of one UPDATE per faction.';

grant execute on function public.bulk_update_faction_influence(uuid[], numeric[]) to service_role;
