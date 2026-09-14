# Memory Tiers (new subsystem)

Three independent, brand-new memory engines — kept deliberately separate
from the existing memory modules under `lib/ai/` and `lib/cognition/`
(no shared keys, tables, or imports either direction).

| Tier | File | Storage | Lifespan | Written by |
|---|---|---|---|---|
| Short-term | `short-term-memory.ts` | Redis, `vantrix:tier:stm:*` | 2h sliding (free) / 6h sliding (premium) | every chat turn |
| Medium-term | `medium-term-memory.ts` | Redis, `vantrix:tier:mtm:*` | 21d sliding | consolidation cron (AI digest) |
| Long-term | `long-term-memory.ts` | Postgres, `memory_tier_long_term` | permanent | consolidation cron (promotion only) |

### Short-term: free vs. premium

`appendShortTermTurn()` (and `recordTurn()` above it) take an optional
`tier` argument — the caller's already-resolved `'free' | 'premium'` string,
forwarded from `chat/stream/route.ts` / `lib/queue/worker.ts` with zero
extra lookups. Free is an exact match for this subsystem's original
behavior (2h TTL, 30-turn cap, pure recency eviction — nothing changes for
existing users). Premium gets a bigger window (6h / 60 turns), a longer
per-turn capture length (1,600 vs 800 chars), and salience-aware retention:
up to 8 turns can be "pinned" past their normal recency slot when they
score as meaningfully more important (disclosures, commitments, emotional
turns) than the filler that would otherwise push them out. See the tiering
note at the top of `short-term-memory.ts` for the full rationale.

`memory-tier-engine.ts` is the facade — `recordTurn()` on the chat path,
`getTieredMemoryContext()` when building a prompt, `runTierConsolidation()` /
`drainDirtyPairs()` from the cron.

## How data moves

```
chat turn ──▶ recordTurn() ──▶ short-term (Redis, 2h)
                                    │
                     every 5 min, cron drains "dirty" pairs
                                    ▼
                        summarizeAndPromote() (AI digest)
                                    │
                                    ▼
                          medium-term (Redis, 21d)
                                    │
                importance ≥ 0.75 OR reinforced ≥ 3 times
                                    ▼
                        addLongTermMemory() (Postgres, permanent)
```

## Setup checklist

1. Run the migration: `supabase/migrations/20270108_memory_tier_long_term.sql`.
2. Deploy — `memory-tier-consolidation` is registered in
   `config/cron-jobs.mjs` at `*/5 * * * *`; `npm run cron:generate`
   (or a normal `prebuild`) picks it up. See `CRON_TIERS.md` for how this
   sub-daily schedule still runs on Vercel Hobby.
3. Optional: set `HEARTBEAT_MEMORY_TIER_CONSOLIDATION` for dead-man's-switch
   monitoring, same as the other crons (see `lib/cron/heartbeat.ts`).
4. Done — `recordTurn(userId, characterId, role, text)` is called from both
   live chat paths (`api/chat/stream/route.ts` and `lib/queue/worker.ts`),
   fire-and-forget, same pattern as `updateMemory()` in `lib/ai/memory.ts`.
5. Done — `getTieredMemoryContext()`'s block is added alongside, not instead
   of, the existing arbiter output in `lib/ai/companion-context.ts`.

Both call sites were reviewed against the live chat path before merging,
per this section's original caution — they're not a blind default.

## User-facing surface

- `DELETE /api/characters/:id/memory-reset` — clears all three tiers for
  one (user, character) pair. Wired to "Forget this conversation" in
  `components/chat/memories-panel.tsx`.
- `GET /api/memories/tiered?characterId=...` — read-only, returns what's
  currently in each tier. Backs the "What's shaping \{name\}'s memory of
  you" section in the same panel (`components/chat/tiered-memory-section.tsx`),
  so the reset action above isn't blind.
- Account-wide GDPR erasure (`api/user/delete`) and export (`api/user/export`)
  both already cover this subsystem — see the `MEMORY-TIERS:` comments in
  each route.

## Why separate from the existing memory modules

`memory-arbiter.ts` already documents what happens when two memory stores
overlap without a shared owner: duplicate facts, no reconciliation, doubled
prompt tokens. This subsystem avoids that by construction — different
Redis prefixes, a different Postgres table, no shared read/write path with
`memory.ts`, `user-fact-graph.ts`, or `memory-graph.ts`. If you later want
these unified under one arbiter instead of running side by side, that's a
deliberate follow-up decision, not something this subsystem assumes for you.
