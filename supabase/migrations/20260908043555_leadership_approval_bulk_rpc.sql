create or replace function bulk_update_leadership_approval(
  p_ids uuid[],
  p_approvals numeric[]
)
returns void
language sql
set search_path = public
as $$
  update leadership_terms t
  set approval = round(v.approval)::integer
  from unnest(p_ids, p_approvals) as v(id, approval)
  where t.id = v.id;
$$;

comment on function bulk_update_leadership_approval is
  'Batched per-row approval write for runLeadershipTick() — one unnest-joined UPDATE per cron tick instead of one UPDATE per leadership term.';

grant execute on function public.bulk_update_leadership_approval(uuid[], numeric[]) to service_role;
