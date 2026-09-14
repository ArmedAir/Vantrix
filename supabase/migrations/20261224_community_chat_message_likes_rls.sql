-- community_chat_message_likes (20261223_community_chat_message_likes.sql)
-- shipped with no RLS at all, which on Supabase means PostgREST exposes it
-- fully open to anyone holding the anon/authenticated key: unauthenticated
-- read of every like, and — worse — insert/delete of a (message_id,
-- user_id) row for *any* user_id, not just your own (e.g. deleting a
-- stranger's like, or liking on someone else's behalf). Same shape as the
-- existing post_likes table (20240101_production.sql:1522-1524), which
-- this mirrors: public read (likes are a public count/signal, same as
-- post_likes_read), insert/delete restricted to auth.uid() = user_id, and
-- an explicit service-role bypass for any backend job that needs it.
ALTER TABLE community_chat_message_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_chat_message_likes_read"    ON community_chat_message_likes;
DROP POLICY IF EXISTS "community_chat_message_likes_insert"  ON community_chat_message_likes;
DROP POLICY IF EXISTS "community_chat_message_likes_delete"  ON community_chat_message_likes;
DROP POLICY IF EXISTS "community_chat_message_likes_service" ON community_chat_message_likes;

CREATE POLICY "community_chat_message_likes_read" ON community_chat_message_likes
  FOR SELECT USING (TRUE);

CREATE POLICY "community_chat_message_likes_insert" ON community_chat_message_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_chat_message_likes_delete" ON community_chat_message_likes
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "community_chat_message_likes_service" ON community_chat_message_likes
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
