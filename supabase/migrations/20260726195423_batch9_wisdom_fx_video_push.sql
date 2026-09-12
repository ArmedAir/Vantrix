-- 20260915_wisdom_habit_engines
create table if not exists user_wisdom (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null,
  character_id           uuid not null,
  domain                 text not null,
  principle              text not null,
  confidence             numeric not null check (confidence >= 0 and confidence <= 1),
  times_applied          integer not null default 1,
  last_applied_turn      integer not null default 0,
  derived_from_lesson_ids text[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_user_wisdom_scope
  on user_wisdom (user_id, character_id);
create unique index if not exists idx_user_wisdom_dedup
  on user_wisdom (user_id, character_id, domain, principle);
alter table user_wisdom enable row level security;
create policy "user_wisdom_service_only"
  on user_wisdom for all to service_role using (true) with check (true);

create table if not exists user_habits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  character_id      uuid not null,
  cue               text not null,
  response          text not null,
  strength          numeric not null check (strength >= 0 and strength <= 1),
  times_fired       integer not null default 1,
  times_rewarded    integer not null default 0,
  last_fired_turn   integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_user_habits_scope
  on user_habits (user_id, character_id);
create unique index if not exists idx_user_habits_dedup
  on user_habits (user_id, character_id, cue, response);
alter table user_habits enable row level security;
create policy "user_habits_service_only"
  on user_habits for all to service_role using (true) with check (true);

-- 20260916_fx_rate_cache
create table if not exists fx_rate_cache (
  pair       text primary key,
  rate       numeric not null check (rate > 0),
  source     text not null,
  updated_at timestamptz not null default now()
);
alter table fx_rate_cache enable row level security;
create policy "service role only" on fx_rate_cache
  for all using (false) with check (false);

-- 20260917_messages_video_url
alter table messages
  add column if not exists video_url text;
alter table messages_archive
  add column if not exists video_url text;

-- 20260918_push_subscriptions
create table if not exists push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  endpoint       text not null,
  p256dh         text not null,
  auth_key       text not null,
  user_agent     text,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  invalid_at     timestamptz
);
create unique index if not exists push_subscriptions_endpoint_key
  on push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id)
  where invalid_at is null;
alter table push_subscriptions enable row level security;
create policy "push_subscriptions_select_own"
  on push_subscriptions for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own"
  on push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own"
  on push_subscriptions for delete using (auth.uid() = user_id);
