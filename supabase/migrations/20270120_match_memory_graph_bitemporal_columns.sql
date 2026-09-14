-- 20270120_match_memory_graph_bitemporal_columns.sql
--
-- match_memory_graph() (20260902_memory_graph_pgvector.sql) returns enough
-- columns to score a similarity hit, but not enough to reconstruct a full
-- MemoryNode (src/lib/ai/memory-graph.ts) from one — it's missing
-- event_time/ingestion_time, added to memory_graph itself a week earlier by
-- 20260909_bitemporal_knowledge_graph.sql. That gap is what forced
-- retrieveRelevantMemories() (src/lib/ai/semantic-memory.ts) to discard any
-- similarity hit outside the caller's already-fetched candidate list instead
-- of surfacing it — exactly the "genuinely relevant older/lower-weight
-- memory the recency/weight query wouldn't have fetched at all" case this
-- whole pgvector upgrade was for. See that file's updated header for the
-- follow-up this unblocks.
--
-- New columns are appended at the end of the existing RETURNS TABLE list,
-- not grouped next to created_at where they'd read more naturally —
-- PostgreSQL only allows CREATE OR REPLACE FUNCTION to change a TABLE-
-- returning function's output columns by appending new ones at the end;
-- reordering or inserting in the middle is a return-type change and errors
-- ("cannot change return type of existing function"). Same function name,
-- same argument list, so every existing caller (searchMemoriesBySimilarity)
-- resolves to this definition automatically — no call-site changes needed
-- beyond widening the SimilarMemory type to read the two new fields.

create or replace function public.match_memory_graph(
  p_user_id        uuid,
  p_character_id   uuid,
  p_query_embedding extensions.vector(384),
  p_match_count    int default 8,
  p_max_distance   float default 0.6
)
returns table (
  id                uuid,
  event_type        text,
  title             text,
  description       text,
  emotional_weight  smallint,
  tags              text[],
  created_at        timestamptz,
  similarity        float,
  event_time        timestamptz,
  ingestion_time    timestamptz
)
language sql
stable
as $$
  select
    mg.id,
    mg.event_type,
    mg.title,
    mg.description,
    mg.emotional_weight,
    mg.tags,
    mg.created_at,
    1 - (mg.embedding <=> p_query_embedding) as similarity,
    mg.event_time,
    mg.ingestion_time
  from public.memory_graph mg
  where mg.user_id = p_user_id
    and mg.character_id = p_character_id
    and mg.embedding is not null
    and (mg.embedding <=> p_query_embedding) <= p_max_distance
  order by mg.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Same grant as the original definition — CREATE OR REPLACE doesn't touch
-- grants, but re-asserting keeps this migration self-contained.
grant execute on function public.match_memory_graph(uuid, uuid, extensions.vector(384), int, float) to service_role;
