-- BUG FIX: conversations_user_character_unique_idx (from
-- 20260727_dedupe_and_unique_conversations.sql) is a PARTIAL unique index
-- (WHERE user_id IS NOT NULL AND character_id IS NOT NULL). Both columns
-- are already NOT NULL on this table, so the predicate is always true and
-- does nothing useful -- but it DOES make this unusable as a PostgREST
-- upsert onConflict target, because Postgres requires ON CONFLICT to name
-- a matching predicate to use a partial index, and PostgREST's
-- `onConflict: 'user_id,character_id'` shorthand can't express one.
--
-- Effect in production: every call to /api/conversations/ensure and the
-- conversation-upsert in chat/[id]/page.tsx has been failing with
-- 42P10 (no unique or exclusion constraint matching the ON CONFLICT
-- specification) since this index was introduced. Both call sites log the
-- error and silently fall through with conversationId undefined, so
-- messages/stream/route.ts's `if (conversationId)` guards skip every
-- message insert -- the AI reply still streams to the browser for that
-- session, but nothing is ever written to `conversations` or `messages`.
-- This is why chat history was empty on reload despite messages being
-- visibly exchanged.
--
-- Fix: replace the partial unique index with a real (non-partial) UNIQUE
-- constraint on the same two columns. Functionally identical (columns are
-- NOT NULL already) but matches PostgREST's plain onConflict shorthand.
drop index if exists conversations_user_character_unique_idx;

alter table conversations
  add constraint conversations_user_character_unique
  unique (user_id, character_id);
