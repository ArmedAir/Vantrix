-- 20260912_journey_stage_engine
create table if not exists journey_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  character_id  uuid references characters(id) on delete set null,
  event_type    text not null check (event_type in (
                    'meaningful_message', 'session_return', 'memory_demonstrated',
                    'world_reference_shown', 'world_reference_tapped', 'companion_customized',
                    'gift_sent', 'character_created', 'location_created', 'lore_created',
                    'content_published', 'creator_followed', 'companion_added'
                  )),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_journey_events_user      on journey_events(user_id, event_type, created_at desc);
create index if not exists idx_journey_events_user_day   on journey_events(user_id, ((created_at AT TIME ZONE 'UTC')::date));

create table if not exists user_journey_state (
  user_id             uuid primary key references profiles(id) on delete cascade,
  stage               smallint not null default 0 check (stage between 0 and 6),
  unlocked_features    text[]  not null default '{}',
  last_computed_at     timestamptz not null default now(),
  last_advanced_at     timestamptz,
  created_at           timestamptz not null default now()
);

alter table profiles add column if not exists journey_stage smallint not null default 0;
create index if not exists idx_profiles_journey_stage on profiles(journey_stage);

alter table journey_events      enable row level security;
alter table user_journey_state  enable row level security;

create policy "journey_events_owner_read" on journey_events
  for select using (auth.uid() = user_id);
create policy "journey_events_service_write" on journey_events
  for all to service_role using (true) with check (true);

create policy "user_journey_state_owner_read" on user_journey_state
  for select using (auth.uid() = user_id);
create policy "user_journey_state_service_write" on user_journey_state
  for all to service_role using (true) with check (true);

-- 20260913_journey_signals_aggregate_rpc
create or replace function get_journey_signals(p_user_id uuid)
returns table (
  meaningful_message_count   int,
  memory_demonstrated_count  int,
  session_return_count       int,
  world_reference_shown_count  int,
  world_reference_tapped_count int,
  companion_customized_count int,
  content_published_count    int,
  creator_followed_count     int,
  location_created_count     int,
  lore_created_count         int,
  distinct_active_days       int
)
language sql
stable
as $$
  select
    count(*) filter (where event_type = 'meaningful_message')::int,
    count(*) filter (where event_type = 'memory_demonstrated')::int,
    count(*) filter (where event_type = 'session_return')::int,
    count(*) filter (where event_type = 'world_reference_shown')::int,
    count(*) filter (where event_type = 'world_reference_tapped')::int,
    count(*) filter (where event_type = 'companion_customized')::int,
    count(*) filter (where event_type = 'content_published')::int,
    count(*) filter (where event_type = 'creator_followed')::int,
    count(*) filter (where event_type = 'location_created')::int,
    count(*) filter (where event_type = 'lore_created')::int,
    count(distinct (created_at at time zone 'UTC')::date)::int
  from journey_events
  where user_id = p_user_id;
$$;

grant execute on function get_journey_signals(uuid) to service_role;

-- 20260914_chat_affinity_discover
CREATE OR REPLACE FUNCTION chat_affinity_tags(p_user_id UUID, p_half_life_days NUMERIC DEFAULT 14)
RETURNS TABLE(tag TEXT, weight NUMERIC)
LANGUAGE sql
STABLE
AS $$
  WITH conv_engagement AS (
    SELECT
      c.character_id,
      LEAST(COUNT(m.id) FILTER (WHERE m.role = 'user'), 200)::NUMERIC AS capped_msg_count,
      POWER(0.5, EXTRACT(EPOCH FROM (NOW() - c.last_message_at)) / (86400 * p_half_life_days)) AS recency_factor
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = p_user_id
    GROUP BY c.id, c.character_id, c.last_message_at
  ),
  char_weight AS (
    SELECT
      character_id,
      SUM(capped_msg_count * recency_factor) AS engagement_weight
    FROM conv_engagement
    GROUP BY character_id
  )
  SELECT tag, SUM(cw.engagement_weight) AS weight
  FROM char_weight cw
  JOIN characters ch ON ch.id = cw.character_id
  CROSS JOIN LATERAL (
    SELECT unnest(ch.tags) AS tag
    UNION ALL
    SELECT 'archetype:' || ch.archetype WHERE ch.archetype IS NOT NULL
  ) tags
  GROUP BY tag
  ORDER BY weight DESC
  LIMIT 60;
$$;
