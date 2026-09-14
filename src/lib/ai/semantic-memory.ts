/**
 * Semantic Memory — Node client for the Python brain service
 * ───────────────────────────────────────────────────────────────────────────
 * memory-graph.ts fetches candidates ranked by emotional_weight + recency.
 * emotion-state.ts's applyEmotionBias() re-sorts those candidates using a
 * hardcoded emotionevent-type affinity table. Both are rule-based and blind
 * to what the user's current message is actually about.
 *
 * PGVECTOR UPGRADE: this module now does real retrieval first, not just
 * reranking. searchMemoriesBySimilarity() (memory-embeddings.ts) queries
 * persisted embeddings directly via Postgres/pgvector's IVFFlat index —
 * candidates the emotion/recency query wouldn't have surfaced at all can
 * now be found. semanticRerankMemories() below is kept as-is and used as
 * the fallback path: if no memories have embeddings yet (pre-migration
 * rows, or the brain service was down when they were written), it still
 * reranks whatever memory-graph.ts already fetched, exactly as before.
 * Nothing that depended on the old behavior breaks; it degrades to it.
 *
 * FAIL OPEN, always: if BRAIN_SERVICE_URL isn't configured, the service is
 * down, slow, or errors, this returns the input order completely unchanged.
 * A chat reply must never be blocked or degraded by this being unavailable —
 * this is a quality enhancement layer, not a dependency.
 */

import { getCircuitBreaker } from '@/lib/circuit-breaker';
import { CircuitOpenError }  from '@/lib/errors';
import { logger }            from '@/lib/logger';
import type { MemoryNode }   from '@/lib/ai/memory-graph';
import { env }                from '@/env';
import { brainServiceAuthHeaders } from '@/lib/ai/brain-service-auth';
import { searchMemoriesBySimilarity, similarMemoryToNode } from '@/lib/ai/memory-embeddings';
import { metrics } from '@/lib/observability';

// A pgvector hit outside the caller's original candidate pool is exactly
// the signal this upgrade exists to surface (see retrieveRelevantMemories
// below) — but admitting an unbounded number of them would let pure
// similarity fully displace the emotion/weight-curated pool the caller
// already built, rather than just giving a standout match "a real chance
// to win" a slot. Raised 3 -> 8 (2026-09-14, recall-reliability pass):
// with SIMILARITY_SEARCH_POOL now decoupled from candidates.length (see
// below), pgvector is searching a materially deeper pool than before, so a
// cap this tight was discarding real matches it had just found. 8 is still
// well short of fully overriding the caller's curated pool (candidates.length
// is typically 30-50). Tune further against real score-distribution data
// the same way match_memory_graph's own p_max_distance is meant to be
// tuned, not guessed forever — see getMemoryRetrievalStats() in
// memory-recall-eval.ts for the harness to do that measurement with.
const MAX_EXTRA_SIMILARITY_HITS = 8;

// pgvector's ANN index can cheaply search far deeper than the candidate
// pool the emotion/recency query happened to fetch — capping the RPC's
// own p_match_count at candidates.length (the old behavior) meant a
// genuinely relevant memory outside that pool could never be found at
// all, not even as one of the MAX_EXTRA_SIMILARITY_HITS admissions, since
// the RPC itself never looked past the pool. Search this much deeper
// regardless of pool size; MAX_EXTRA_SIMILARITY_HITS above still governs
// how many of those deeper hits are actually allowed to bump into the
// final list.
const SIMILARITY_SEARCH_POOL = 60;

const REQUEST_TIMEOUT_MS = 1_200; // generous enough for a small local model, short enough to never be felt in chat latency
const MAX_TEXT_LEN       = 400;   // truncate memory text before sending — keeps payload + encode time small

interface RerankApiResponse {
  ranked: { id: string; score: number }[];
}

function memoryText(m: MemoryNode): string {
  const combined = `${m.title}. ${m.description}`;
  return combined.length > MAX_TEXT_LEN ? combined.slice(0, MAX_TEXT_LEN) : combined;
}

/**
 * Re-orders `memories` by semantic similarity to `userMessage`, blended with
 * the existing (emotion-biased) order as a stable tiebreak. Returns the
 * original array, untouched, on any failure or misconfiguration.
 */
export async function semanticRerankMemories(
  memories:    MemoryNode[],
  userMessage: string,
): Promise<MemoryNode[]> {
  if (memories.length < 2) return memories;

  const baseUrl = env.BRAIN_SERVICE_URL;
  if (!baseUrl) return memories; // not configured — silent no-op, same pattern as heartbeat.ts

  const breaker = getCircuitBreaker('ai:brain-service', {
    failureThreshold: 4,
    timeout: 30_000,
  });

  try {
    return await breaker.execute(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(`${baseUrl}/rerank`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...brainServiceAuthHeaders() },
          body: JSON.stringify({
            query: userMessage.slice(0, 4000),
            candidates: memories.map((m) => ({ id: m.id, text: memoryText(m) })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`brain-service rerank failed: ${res.status}`);
        }

        const data = (await res.json()) as RerankApiResponse;
        const scoreById = new Map(data.ranked.map((r) => [r.id, r.score]));

        // Blend: semantic score is the primary sort key, but stable — memories
        // missing from the response (shouldn't happen, but defensively handled)
        // keep their original relative order via the index tiebreak.
        const withIndex = memories.map((m, idx) => ({ m, idx, score: scoreById.get(m.id) ?? -1 }));
        withIndex.sort((a, b) => b.score - a.score || a.idx - b.idx);

        return withIndex.map((x) => x.m);
      } finally {
        clearTimeout(timer);
      }
    });
  } catch (err) {
    if (!(err instanceof CircuitOpenError)) {
      logger.warn('semantic-memory:rerank-failed', { error: String(err) });
    }
    return memories; // fail open — never block or degrade the chat reply
  }
}

/**
 * PGVECTOR UPGRADE — the entry point call sites should use going forward.
 *
 * Real retrieval-first ordering, with graceful degradation through every
 * layer this system already has:
 *
 *   1. Try pgvector similarity search (searchMemoriesBySimilarity) against
 *      ALL of this pair's embedded memories, not just the small candidate
 *      set memory-graph.ts happened to fetch by weight/recency. If that
 *      finds real matches, use them (re-hydrated against the full
 *      MemoryNode objects passed in, so callers still get complete nodes,
 *      not the RPC's trimmed row shape).
 *   2. If pgvector finds nothing (no embedded rows yet, brain service down,
 *      or genuinely no similar memory exists), fall back to the *existing*
 *      semanticRerankMemories() behavior — live rerank of the candidates
 *      already fetched. This is the exact pre-upgrade behavior, unchanged.
 *   3. If that also can't run (brain service unavailable), fall back to the
 *      candidates' original (emotion/recency-biased) order, untouched.
 *
 * Every step is independently fail-open; a chat reply is never blocked or
 * degraded by any layer of this being unavailable.
 *
 * CONTRACT WIDENED (20270120_match_memory_graph_bitemporal_columns.sql): a
 * similarity hit outside `candidates` is no longer discarded. Once
 * match_memory_graph could return every field a MemoryNode needs, there was
 * no more reason to throw away "an older, lower-weight memory the
 * recency/weight query didn't fetch at all" — that case is the entire
 * reason this module exists (see the module header above and
 * companion-context.ts's FEATURE-7 comment on the same gap). Bounded by
 * MAX_EXTRA_SIMILARITY_HITS so this promotes a handful of standout matches
 * rather than letting similarity fully override the caller's curated pool.
 */
export async function retrieveRelevantMemories(
  userId: string,
  characterId: string,
  candidates: MemoryNode[],
  userMessage: string,
): Promise<MemoryNode[]> {
  if (candidates.length < 2) return candidates;

  try {
    const similar = await searchMemoriesBySimilarity(userId, characterId, userMessage, {
      limit: Math.max(candidates.length, SIMILARITY_SEARCH_POOL),
    });

    if (similar.length > 0) {
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const ordered: MemoryNode[] = [];
      const usedIds = new Set<string>();
      let extraAdmitted = 0;

      for (const s of similar) {
        const full = byId.get(s.id);
        if (full) {
          ordered.push(full);
          usedIds.add(full.id);
        } else if (extraAdmitted < MAX_EXTRA_SIMILARITY_HITS) {
          // A similarity hit outside the original candidate set — an
          // older, lower-weight memory the recency/weight query didn't
          // fetch at all. Real signal worth surfacing, capped (see
          // MAX_EXTRA_SIMILARITY_HITS above).
          ordered.push(similarMemoryToNode(s));
          usedIds.add(s.id);
          extraAdmitted++;
        }
      }
      // Preserve any candidates pgvector didn't return (below threshold or
      // not yet embedded) at the end, in their original order.
      for (const c of candidates) {
        if (!usedIds.has(c.id)) ordered.push(c);
      }
      metrics.recordMemoryRetrieval('pgvector_hit');
      return ordered;
    }
  } catch (err) {
    logger.warn('semantic-memory:pgvector-search-failed', { userId, characterId, error: String(err) });
    // fall through to legacy rerank path below — record which branch it
    // lands in below rather than here, since we don't yet know if rerank
    // will itself succeed.
    const reranked = await semanticRerankMemories(candidates, userMessage);
    metrics.recordMemoryRetrieval(
      reranked !== candidates ? 'pgvector_error_rerank_hit' : 'pgvector_error_rerank_noop',
    );
    return reranked;
  }

  // pgvector ran cleanly but found nothing (unembedded rows, or genuinely
  // no similar memory) — same "which branch did it land in" tracking as
  // the catch block above, distinguished by outcome label only.
  const reranked = await semanticRerankMemories(candidates, userMessage);
  metrics.recordMemoryRetrieval(
    reranked !== candidates ? 'pgvector_empty_rerank_hit' : 'pgvector_empty_rerank_noop',
  );
  return reranked;
}
