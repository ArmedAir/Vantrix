create or replace function bulk_update_collective_memory_strength(
  p_ids uuid[],
  p_strengths numeric[]
)
returns void
language sql
set search_path = public
as $$
  update collective_memories m
  set strength = v.strength
  from unnest(p_ids, p_strengths) as v(id, strength)
  where m.id = v.id;
$$;

comment on function bulk_update_collective_memory_strength is
  'Batched per-row strength write for decayCollectiveMemories() — one unnest-joined UPDATE per decay run instead of one UPDATE per surviving memory.';

grant execute on function public.bulk_update_collective_memory_strength(uuid[], numeric[]) to service_role;
