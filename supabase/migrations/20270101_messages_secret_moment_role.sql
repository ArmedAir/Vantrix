-- Allow a 'secret_moment' role on messages so generated poems/letters/
-- memory-recaps/playlists/appreciation notes (see src/lib/ai/secret-
-- moments.ts) can be identified and rendered as their own distinct
-- envelope/card treatment in the chat timeline, the same way 'gift' rows
-- already get a distinct treatment instead of looking like an ordinary
-- assistant reply — see 2026071501_messages_gift_role.sql, same pattern.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user','assistant','system','gift','secret_moment'));
