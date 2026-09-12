-- Migrate notifications table to v2 schema (icon, urgency, metadata, delivered_push, read_at)
-- and create notification_preferences, matching the app's emitNotification / inbox / preferences routes.

alter table public.notifications
  add column if not exists icon text,
  add column if not exists urgency text not null default 'low',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists delivered_push boolean not null default false,
  add column if not exists read_at timestamptz;

-- Backfill from old columns
update public.notifications
set metadata = coalesce(data, '{}'::jsonb),
    read_at = case when read then created_at else null end
where metadata = '{}'::jsonb;

-- Drop old columns now that data has been migrated
alter table public.notifications
  drop column if exists data,
  drop column if exists cta_label,
  drop column if exists read;

-- Keep urgency to a known set of values
alter table public.notifications
  drop constraint if exists notifications_urgency_check;
alter table public.notifications
  add constraint notifications_urgency_check check (urgency in ('low', 'normal', 'high'));

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read_at)
  where read_at is null;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- notification_preferences: per-user per-type overrides, stored as jsonb map
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists notif_prefs_own_select on public.notification_preferences;
create policy notif_prefs_own_select on public.notification_preferences
  for select
  using (user_id = (select auth.uid()));

drop policy if exists notif_prefs_own_upsert on public.notification_preferences;
create policy notif_prefs_own_upsert on public.notification_preferences
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists notif_prefs_own_update on public.notification_preferences;
create policy notif_prefs_own_update on public.notification_preferences
  for update
  using (user_id = (select auth.uid()));

drop policy if exists notif_prefs_service on public.notification_preferences;
create policy notif_prefs_service on public.notification_preferences
  for all
  to service_role
  using (true);

