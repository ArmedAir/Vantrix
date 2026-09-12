-- ============================================================================
-- Hybrid Memory Architecture: Bitemporal Episodic Log + Semantic Knowledge Graph
-- ============================================================================
-- Two additions, deliberately layered on top of the existing memory stack
-- rather than replacing it:
--
-- 1. BITEMPORAL EPISODIC LOG (memory_graph gains event_time / ingestion_time)
--    memory_graph already stores episodic events, but only had a single
--    created_at — conflating "when it happened in the world" with "when the
--    AI learned about it". That distinction matters whenever a fact is
--    disclosed late (e.g. "I forgot to tell you last week I got the job") —
--    without it, the event sorts/displays as if it happened at ingestion
--    time, corrupting the timeline shown back to the user and any
--    recency-weighted retrieval. We add both columns with event_time
--    backfilled from created_at (best available approximation for existing
--    rows) and ingestion_time defaulting to NOW() at write time — the two
--    diverge only when a caller explicitly passes an earlier event_time.
--
-- 2. SEMANTIC KNOWLEDGE GRAPH (new knowledge_graph_edges table)
--    user_facts (existing) is a flat category/key/value bag — adequate for
--    prompt injection but not a graph: no explicit subject/predicate/object
--    structure, no deterministic point-lookup ("what city does this user
--    live in, right now"), and no versioning when a fact changes (a new
--    'location' key silently upserts over the old one via the (user,
--    character, key) unique constraint, destroying history).
--    knowledge_graph_edges stores facts as (subject)-[predicate]->(object)
--    triplets. Superseding an edge inserts a new row and marks the old one
--    invalidated (valid_to set) rather than overwriting it — the same
--    bitemporal shape as the episodic log, applied to facts instead of
--    events. This gives deterministic recall (exact predicate lookup,
--    no vector fuzziness) for core identity facts, while user_facts /
--    memory-embeddings.ts continue to serve fuzzy, high-recall retrieval.
--    The two are complementary, not a replacement of one by the other.
-- ============================================================================

-- ── 1. Bitemporal columns on memory_graph ───────────────────────────────────

ALTER TABLE memory_graph
  ADD COLUMN IF NOT EXISTS event_time      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingestion_time  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: best available approximation for pre-existing rows is that the
-- event and its ingestion coincided.
UPDATE memory_graph
  SET event_time = created_at
  WHERE event_time IS NULL;

ALTER TABLE memory_graph
  ALTER COLUMN event_time SET NOT NULL,
  ALTER COLUMN event_time SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_memory_graph_user_char_event_time
  ON memory_graph(user_id, character_id, event_time DESC);

-- ── 2. Knowledge graph: entity-relation triplets ────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  character_id     UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  -- Triplet: (subject)-[predicate]->(object). subject is almost always
  -- 'user' or 'character' (the two entities the companion reasons about);
  -- kept as free text rather than an FK so future entities (a named
  -- family member, a pet, an employer) can become subjects/objects too
  -- without a schema change.
  subject          TEXT        NOT NULL DEFAULT 'user',
  predicate        TEXT        NOT NULL,   -- e.g. LIVES_IN, WORKS_AS, HAS_PET, DISLIKES
  object           TEXT        NOT NULL,   -- e.g. 'Austin', 'nurse', 'a golden retriever named Max'

  confidence       REAL        NOT NULL DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  source           TEXT        NOT NULL DEFAULT 'heuristic' CHECK (source IN ('heuristic', 'ai', 'user_confirmed')),

  -- Bitemporal: when this was true in the world vs. when the AI learned it.
  event_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingestion_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Versioning: an edge is live while valid_to IS NULL. Superseding a fact
  -- (e.g. user moves city) inserts a new edge and sets the old edge's
  -- valid_to instead of deleting/overwriting it, so "what did we believe
  -- and when" stays reconstructable.
  valid_to         TIMESTAMPTZ,
  superseded_by    UUID        REFERENCES knowledge_graph_edges(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deterministic point-lookup: "what is the live edge for (user, LIVES_IN)".
CREATE INDEX IF NOT EXISTS idx_kg_edges_live_lookup
  ON knowledge_graph_edges(user_id, character_id, subject, predicate)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_kg_edges_user_char_time
  ON knowledge_graph_edges(user_id, character_id, ingestion_time DESC);

ALTER TABLE knowledge_graph_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kg_edges_own_read" ON knowledge_graph_edges FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "kg_edges_service"  ON knowledge_graph_edges FOR ALL   TO service_role USING (TRUE);
