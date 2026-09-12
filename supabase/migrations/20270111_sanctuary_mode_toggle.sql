-- Sanctuary Mode / World Mode toggle
--
-- universeContext (location, social graph, active events/stories,
-- life/job/status/reputation/economy/assets — ~30 sub-engines, see
-- universe-prompt.ts) was appended to every system prompt unconditionally
-- whenever assembleUniverseContext() returned anything
-- (chat/stream/route.ts, was line 2298) — no per-user or per-conversation
-- flag gated it. Users who wanted "isolated intimacy" (just them and the
-- companion, no living-world chatter) had no way to opt out. This is the
-- DB side of that opt-out.
--
-- Mirrors dating_mode's existing per-conversation-flag pattern exactly
-- (same table, same shape, same default-off).
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sanctuary_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN conversations.sanctuary_mode IS
  'User-set per-conversation toggle. When true, assembleCompanionContext() (companion-context.ts) skips assembleUniverseContext() entirely for this conversation''s turns — no world/universe context is fetched or injected into the system prompt. Written only by PATCH /api/conversations/[id]; RLS already covers this via the existing conversations_own FOR ALL policy (auth.uid() = user_id), no new policy needed.';

-- No RLS policy changes: conversations already has a full-CRUD-own policy
-- ("conversations_own" FOR ALL USING (auth.uid() = user_id)), unlike
-- priority_memories/digital_twin_profiles which needed dedicated
-- policies added for their own user-control migrations.
