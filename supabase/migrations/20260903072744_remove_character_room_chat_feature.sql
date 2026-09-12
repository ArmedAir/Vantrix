-- Remove the Character Room live-chat feature entirely (per-character
-- shared chat room, distinct from 1:1 character chats and community
-- discussion boards). Frontend/API code removed alongside this migration:
--   src/lib/community/character-room.ts
--   src/app/api/community/chat/**
--   src/app/(app)/characters/[id]/room/**
--   src/components/characters/enter-room-button.tsx
--   src/components/characters/character-room-chat.tsx
-- No other feature reads/writes these tables (confirmed: no external FKs).

drop table if exists public.community_chat_message_likes;
drop table if exists public.community_chat_messages;
