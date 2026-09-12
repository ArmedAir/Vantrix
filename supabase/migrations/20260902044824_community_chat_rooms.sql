-- ============================================================================
-- Migration: community_chat_rooms
-- Live chat room per community — plain-text messages, distinct from the
-- existing threaded community_posts/community_replies forum.
--
-- community_posts/community_replies (20241000_community.sql) are a Reddit-
-- style forum: titled posts, tags, nested replies, meant to be browsed
-- later. This is the opposite shape on purpose — a flat, append-only log of
-- short plain-text lines meant to be read live, the way #general in a Slack
-- or Discord works. Same two static communities (general, creator-hub;
-- see lib/community/get-communities.ts) get a room each, keyed by the same
-- community_slug string community_posts already uses — no new "communities"
-- table, no FK to one, matching community_posts' own convention of not
-- constraining community_slug to an enum at the DB layer.
-- ============================================================================

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists community_chat_messages (
  id              uuid        primary key default gen_random_uuid(),
  community_slug  text        not null,
  author_id       uuid        not null references profiles(id) on delete cascade,
  body            text        not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists community_chat_messages_slug_created_idx
  on community_chat_messages(community_slug, created_at desc);

create index if not exists community_chat_messages_author_idx
  on community_chat_messages(author_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table community_chat_messages enable row level security;

drop policy if exists "community_chat_messages_select" on community_chat_messages;
drop policy if exists "community_chat_messages_insert" on community_chat_messages;
drop policy if exists "community_chat_messages_delete_own" on community_chat_messages;

create policy "community_chat_messages_select"
  on community_chat_messages for select
  to authenticated
  using (true);

create policy "community_chat_messages_insert"
  on community_chat_messages for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "community_chat_messages_delete_own"
  on community_chat_messages for delete
  to authenticated
  using (author_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────────────────────

alter table community_chat_messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'community_chat_messages'
  ) then
    alter publication supabase_realtime add table community_chat_messages;
  end if;
end $$;

