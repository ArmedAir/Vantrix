-- CHAT-LINK-404-FIX: notifications/route.ts used to build milestone/
-- character-surprise notification links as `/chat/${characterId}`, but
-- chat/[id]/page.tsx keys strictly on conversationId, not characterId --
-- there is no conversations row with that id, so every one of these
-- notifications 404'd when tapped. The route itself is fixed to resolve
-- the real conversationId going forward; this backfills the notifications
-- already sitting in users' inboxes with the broken characterId link,
-- pointing each at its actual (user, character) conversation.
UPDATE notifications n
SET cta_url = '/chat/' || c.id
FROM conversations c
WHERE n.cta_url ~ '^/chat/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND c.user_id = n.user_id
  AND c.character_id = substring(n.cta_url from 7)::uuid
  AND NOT EXISTS (
    SELECT 1 FROM conversations c2 WHERE c2.id = substring(n.cta_url from 7)::uuid
  );
