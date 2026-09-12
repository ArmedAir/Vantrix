-- ─────────────────────────────────────────────────────────────────────────
-- Memory Tiers — Long-Term table
-- ─────────────────────────────────────────────────────────────────────────
-- Backs src/lib/memory-tiers/long-term-memory.ts. Deliberately a separate
-- table from `memory_graph` — this is a new, independent memory-tier
-- subsystem (short/medium/long, see src/lib/memory-tiers/README.md), not a
-- replacement for the existing event-graph memory. Nothing in this
-- migration alters memory_graph, priority_memories, or any existing table.

create table if not exists public.memory_tier_long_term (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  character_id            uuid not null references public.characters(id) on delete cascade,
  headline                text not null,
  content                 text not null,
  -- Same 1-10 convention as memory_graph.emotional_weight (see
  -- MEMORY_WEIGHT_MIN/MAX in lib/ai/memory-graph.ts) — kept consistent on
  -- purpose so the two tiers' importance scales don't diverge.
  importance              smallint not null check (importance between 1 and 10),
  source                  text not null default 'promoted' check (source in ('promoted', 'manual')),
  -- Traceability back to the medium-term-memory.ts digest that triggered
  -- this promotion. Not a foreign key: medium-term entries live in Redis
  -- (see medium-term-memory.ts), not Postgres, so this is just a string id.
  origin_medium_term_id   text,
  reinforcement_count     integer not null default 1,
  created_at              timestamptz not null default now(),
  last_reinforced_at      timestamptz not null default now()
);

create index if not exists memory_tier_long_term_pair_idx
  on public.memory_tier_long_term (user_id, character_id, importance desc, reinforcement_count desc);

alter table public.memory_tier_long_term enable row level security;

-- Service-role only (all reads/writes go through supabaseAdmin in
-- long-term-memory.ts, same posture as memory_graph). No user-facing
-- direct-table policy is defined here; add one explicitly if a future
-- client-side "your memories" view needs it.
drop policy if exists "memory_tier_long_term_service_role" on public.memory_tier_long_term;
create policy "memory_tier_long_term_service_role"
  on public.memory_tier_long_term
  for all
  to service_role
  using (true)
  with check (true);
