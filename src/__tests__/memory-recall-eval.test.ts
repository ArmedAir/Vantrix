// src/__tests__/memory-recall-eval.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Recall-accuracy eval harness (2026-09-14, recall-reliability pass).
//
// Every other memory test in this suite (memory-tiers-*.test.ts, memory-arbiter
// coverage, etc.) checks a single unit's logic in isolation: does addLongTermMemory
// dedup correctly, does the arbiter pick the right precedence. None of them ask
// the actual product question: "the user told the character something specific
// in an early turn — does retrieval actually surface it dozens of turns later,
// once it's competing with hundreds of other memories and is no longer the most
// emotionally weighted or most recent thing in the graph?" That is what "reliable
// recall, not just a memory feature" means, and it can only be answered by
// measuring retrieval end-to-end against a large synthetic relationship history,
// not by reading the code.
//
// This harness:
//   1. Generates a synthetic long relationship (hundreds of memory_graph rows)
//      with a handful of specific, low-emotional-weight "planted facts" seeded
//      at random early points — deliberately low-weight so they would NOT
//      survive the emotion/recency ranking companion-context.ts's getMemoryGraph
//      candidate pool is built from. If retrieval finds them anyway, that's
//      semantic retrieval actually doing its job, not recency/weight coincidence.
//   2. Drives retrieveRelevantMemories() (the real function, not a mock of it)
//      with a much-later query that semantically references each planted fact.
//   3. Stands in for the brain service with a real (if crude) text-similarity
//      function — not a canned "return the right answer" mock — so the eval
//      exercises the actual candidate-pool / extra-admission / fallback logic
//      in semantic-memory.ts rather than testing its own fixture.
//   4. Asserts recall@8 (formatMemoryGraphForPrompt's real display cap — see
//      memory-graph.ts) against a floor. A regression that silently narrows the
//      candidate pool, tightens MAX_EXTRA_SIMILARITY_HITS, or breaks the
//      similarity plumbing fails this test with a concrete number, not a vibe.
//
// Run in isolation: `npx vitest run src/__tests__/memory-recall-eval.test.ts`
// Prints a recall report to stdout either way — useful for tuning
// MAX_EXTRA_SIMILARITY_HITS / SIMILARITY_SEARCH_POOL / p_max_distance against
// real numbers instead of guessing, per semantic-memory.ts's own comments.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemoryNode, MemoryEventType } from '@/lib/ai/memory-graph';
import type { SimilarMemory } from '@/lib/ai/memory-embeddings';

// ── Stand in for the brain service with real (crude) word-overlap similarity,
// not a canned answer — see file header. This is deliberately dumber than a
// real embedding model (no synonyms, no semantics beyond shared tokens) so a
// pass here is a floor, not a ceiling, on what production similarity search
// should achieve.
function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2),
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a), tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / new Set([...ta, ...tb]).size;
}

let allMemoriesRef: MemoryNode[] = [];
let brainServiceAvailable = true;

vi.mock('@/env', () => ({
  env: new Proxy({}, { get: (_t, prop) => (prop === 'BRAIN_SERVICE_URL' ? (brainServiceAvailable ? 'http://mock-brain' : '') : undefined) }),
}));

vi.mock('@/lib/ai/memory-embeddings', () => ({
  searchMemoriesBySimilarity: vi.fn(async (
    _userId: string, _characterId: string, userMessage: string, opts: { limit?: number } = {},
  ): Promise<SimilarMemory[]> => {
    if (!brainServiceAvailable) return [];
    const scored = allMemoriesRef
      .map(m => ({ m, score: jaccardSimilarity(userMessage, `${m.title}. ${m.description}`) }))
      .filter(x => x.score > 0.12) // stand-in for p_max_distance's threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 8);
    return scored.map(({ m, score }) => ({
      id: m.id, event_type: m.event_type, title: m.title, description: m.description,
      emotional_weight: m.emotional_weight, tags: m.tags, created_at: m.created_at,
      similarity: score, event_time: m.event_time, ingestion_time: m.ingestion_time,
    }));
  }),
  similarMemoryToNode: (s: SimilarMemory): MemoryNode => ({
    id: s.id, event_type: s.event_type as MemoryEventType, title: s.title,
    description: s.description, emotional_weight: s.emotional_weight, tags: s.tags,
    created_at: s.created_at, event_time: s.event_time, ingestion_time: s.ingestion_time,
  }),
}));

vi.mock('@/lib/observability', () => ({
  metrics: { recordMemoryRetrieval: vi.fn() },
}));

vi.mock('@/lib/circuit-breaker', () => ({
  getCircuitBreaker: () => ({ execute: (fn: () => unknown) => fn() }),
}));
vi.mock('@/lib/errors', () => ({ CircuitOpenError: class CircuitOpenError extends Error {} }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/ai/brain-service-auth', () => ({ brainServiceAuthHeaders: () => ({}) }));

// ── Synthetic relationship generator ────────────────────────────────────────

const FILLER_TOPICS = [
  ['daily_life', 'Checked in about the day', 'We talked about how the day went, nothing eventful.'],
  ['daily_life', 'Weather small talk', 'Complained about the weather being too hot again.'],
  ['shared_joke', 'The usual running joke', 'Made the same joke we always make about mornings.'],
  ['daily_life', 'Work vented', 'Vented a bit about a long day at work.'],
] as const;

interface PlantedFact {
  memoryId: string;
  turnIndex: number;
  factText: string;   // what got said, low-weight, easy to bury
  queryText: string;  // how a much-later turn would naturally reference it
}

const PLANTED_FACTS: Omit<PlantedFact, 'memoryId' | 'turnIndex'>[] = [
  {
    factText: 'Mentioned their sister Priya is getting married in Lisbon next spring.',
    queryText: 'Do you remember what city my sister is having her wedding in?',
  },
  {
    factText: 'Said they used to play trumpet in a jazz band back in college.',
    queryText: 'I was thinking about picking up an instrument again — what did I play back in college?',
  },
  {
    factText: 'Revealed their childhood dog was a golden retriever named Biscuit.',
    queryText: 'I saw a golden retriever today and thought of my old dog — what was his name again?',
  },
  {
    factText: 'Mentioned they are allergic to shellfish and avoid sushi with shrimp.',
    queryText: "We're picking a restaurant tonight, remind me what seafood I need to avoid?",
  },
  {
    factText: 'Said their dream is to open a small bookstore in Portland someday.',
    queryText: "What's that business idea I told you I dream about opening one day?",
  },
];

function makeMemory(idx: number, eventType: string, title: string, description: string, weight: number, daysAgo: number): MemoryNode {
  const t = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id: `mem-${idx}`,
    event_type: eventType as MemoryEventType,
    title, description,
    emotional_weight: weight,
    tags: [],
    created_at: t, event_time: t, ingestion_time: t,
  };
}

/** Builds ~300 turns of relationship history with PLANTED_FACTS seeded early
 *  and buried under filler by the time of the "current" query. Returns the
 *  full pool (what a real memory_graph table would hold) and the candidate
 *  pool a real getMemoryGraph(userId, characterId, 50) call would return
 *  (top 50 by emotional_weight then event_time, exactly matching the real
 *  query's ORDER BY — see memory-graph.ts). */
function generateSyntheticRelationship(totalTurns = 300): { allMemories: MemoryNode[]; candidatePool: MemoryNode[]; facts: PlantedFact[] } {
  const all: MemoryNode[] = [];
  const facts: PlantedFact[] = [];

  const plantTurns = PLANTED_FACTS.map((_, i) => 5 + i * 7); // scattered in the first ~40 turns

  for (let turn = 0; turn < totalTurns; turn++) {
    const daysAgo = totalTurns - turn; // earlier turn = longer ago
    const plantIdx = plantTurns.indexOf(turn);
    if (plantIdx !== -1) {
      const spec = PLANTED_FACTS[plantIdx];
      // Deliberately LOW weight (2) — must not survive on emotional_weight
      // ranking alone. If it's found, semantic retrieval did the work.
      const node = makeMemory(all.length, 'confession', spec.factText.slice(0, 40), spec.factText, 2, daysAgo);
      all.push(node);
      facts.push({ memoryId: node.id, turnIndex: turn, ...spec });
    } else {
      const [eventType, title, desc] = FILLER_TOPICS[turn % FILLER_TOPICS.length];
      // Filler is HIGH weight and recent-ish, on purpose — it's what should
      // normally dominate the emotion/recency candidate pool and bury the
      // planted facts if semantic retrieval isn't doing real work.
      all.push(makeMemory(all.length, eventType, title, desc, 6 + (turn % 4), daysAgo));
    }
  }

  const candidatePool = [...all]
    .sort((a, b) => b.emotional_weight - a.emotional_weight || +new Date(b.event_time) - +new Date(a.event_time))
    .slice(0, 50); // mirrors companion-context.ts's real getMemoryGraph(..., 50) call

  return { allMemories: all, candidatePool, facts };
}

// ── The eval itself ─────────────────────────────────────────────────────────

describe('memory recall eval — retrieveRelevantMemories end-to-end accuracy', () => {
  beforeEach(() => {
    brainServiceAvailable = true;
    vi.clearAllMocks();
  });

  it('recalls planted low-weight facts within the top-8 display cap (recall@8 floor)', async () => {
    const { retrieveRelevantMemories } = await import('@/lib/ai/semantic-memory');
    const { allMemories, candidatePool, facts } = generateSyntheticRelationship();
    allMemoriesRef = allMemories;

    const results: { fact: string; found: boolean; rank: number | null }[] = [];

    for (const fact of facts) {
      const ordered = await retrieveRelevantMemories('user-1', 'char-1', candidatePool, fact.queryText);
      const rank = ordered.findIndex(m => m.id === fact.memoryId);
      results.push({ fact: fact.factText, found: rank !== -1 && rank < 8, rank: rank === -1 ? null : rank });
    }

    const recallAt8 = results.filter(r => r.found).length / results.length;

    // eslint-disable-next-line no-console
    console.log('\n[memory-recall-eval] recall@8 report:');
    for (const r of results) {
      console.log(`  ${r.found ? '✅' : '❌'} rank=${r.rank ?? 'not found'}  "${r.fact.slice(0, 60)}..."`);
    }
    console.log(`  recall@8 = ${(recallAt8 * 100).toFixed(0)}% (${results.filter(r => r.found).length}/${results.length})\n`);

    // Floor, not a target — this is the number that should alert a human if
    // it drops, the same way vantrix_memory_retrieval_degraded_rate should
    // in production (see observability/index.ts). Tune alongside
    // MAX_EXTRA_SIMILARITY_HITS / SIMILARITY_SEARCH_POOL in semantic-memory.ts.
    expect(recallAt8).toBeGreaterThanOrEqual(0.8);
  });

  it('degrades to unchanged candidate order (never throws, never blocks) when the brain service is down', async () => {
    const { retrieveRelevantMemories } = await import('@/lib/ai/semantic-memory');
    const { candidatePool } = generateSyntheticRelationship(30);
    allMemoriesRef = candidatePool;
    brainServiceAvailable = false;

    const ordered = await retrieveRelevantMemories('user-1', 'char-1', candidatePool, 'anything at all');
    expect(ordered).toEqual(candidatePool); // exact fail-open contract, unchanged
  });

  it('records a metrics outcome for every retrieval — the production visibility this eval exists to justify', async () => {
    const { retrieveRelevantMemories } = await import('@/lib/ai/semantic-memory');
    const { metrics } = await import('@/lib/observability');
    const { candidatePool } = generateSyntheticRelationship(30);
    allMemoriesRef = candidatePool;

    await retrieveRelevantMemories('user-1', 'char-1', candidatePool, 'Do you remember my sister?');
    expect(metrics.recordMemoryRetrieval).toHaveBeenCalledTimes(1);
    expect(metrics.recordMemoryRetrieval).toHaveBeenCalledWith(
      expect.stringMatching(/^pgvector_/),
    );
  });
});
