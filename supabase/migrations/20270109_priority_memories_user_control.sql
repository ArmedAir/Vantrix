-- Priority Memories — user control (edit / delete / pin)
--
-- GET /api/memories/priority was explicitly read-only (see that route's
-- original doc comment: "nothing in this route ever writes"). Users could
-- see a wrong or unwanted memory but had no way to fix, remove, or pin one
-- — the "hallucination drift" gap the product spec calls out. This
-- migration is the DB side of PATCH/DELETE /api/memories/priority/[id].
--
-- is_pinned: user-controlled surfacing preference. promoteMemoryNode() and
-- promoteFact()'s upsert payloads never include this column, so it's left
-- untouched on conflict — a pin survives re-promotion automatically.
--
-- user_edited: set true the moment a user PATCHes a memory's headline or
-- content. promoteMemoryNode()/promoteFact() check this flag before
-- upserting and skip re-promoting that source row once it's true —
-- otherwise the next automatic promotion cycle for the same
-- (user_id, character_id, source, source_id) key would silently overwrite
-- the user's correction right back to the original (possibly wrong)
-- auto-generated text.
ALTER TABLE priority_memories
  ADD COLUMN IF NOT EXISTS is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_edited BOOLEAN NOT NULL DEFAULT FALSE;

-- Pinned-first ordering, mirroring community_posts' pinned index.
CREATE INDEX IF NOT EXISTS idx_priority_memories_pinned
  ON priority_memories (user_id, character_id, is_pinned DESC, importance DESC);

COMMENT ON COLUMN priority_memories.is_pinned IS
  'User-set surfacing preference. Only written by PATCH /api/memories/priority/[id] — never by promoteMemoryNode/promoteFact.';
COMMENT ON COLUMN priority_memories.user_edited IS
  'Set true on the first user edit to headline/content. Once true, promoteMemoryNode/promoteFact skip re-promoting this source row so automatic re-promotion cannot silently overwrite the user''s correction.';

-- No RLS policy changes: priority_memories already has no per-user
-- UPDATE/DELETE policy (only "priority_memories_own_read" SELECT and
-- "priority_memories_service" FOR ALL TO service_role). The new routes
-- write through supabaseAdmin with an application-level ownership check,
-- exactly like DELETE /api/community/posts/[id] already does.
