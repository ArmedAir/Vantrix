// src/lib/ai/__tests__/semantic-memory-retrieval.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// retrieveRelevantMemories() (semantic-memory.ts) used to only ever reorder
// the caller's own candidate list — a pgvector similarity hit outside that
// list was found, scored, and then thrown away, regardless of how relevant
// it was. That was a deliberately-deferred gap (see the module's prior
// header), closed once match_memory_graph could return every field needed
// to reconstruct a full MemoryNode
// (20270120_match_memory_graph_bitemporal_columns.sql). These tests lock
// the widened contract: an out-of-pool hit is now admitted, up to
// MAX_EXTRA_SIMILARITY_HITS, and falls back exactly as before when pgvector
// finds nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MemoryNode } from '../memory-graph';
import type { SimilarMemory } from '../memory-embeddings';

vi.mock('@/env', () => ({ env: { BRAIN_SERVICE_URL: undefined } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
// memory-embeddings.ts imports supabaseAdmin at module top level, which
// constructs a real Supabase client (throws without real env vars) —
// stubbed here purely so importOriginal() below can load the module to get
// the real similarMemoryToNode(); nothing in these tests actually calls
// supabaseAdmin, since searchMemoriesBySimilarity is mocked below.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/lib/ai/memory-embeddings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../memory-embeddings')>();
  return { ...actual, searchMemoriesBySimilarity: vi.fn() };
});

import { searchMemoriesBySimilarity } from '@/lib/ai/memory-embeddings';
import { retrieveRelevantMemories } from '../semantic-memory';

const mockedSearch = vi.mocked(searchMemoriesBySimilarity);

function node(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: 'm-default', event_type: 'daily_life', title: 'Untitled',
    description: 'Nothing in particular.', emotional_weight: 5, tags: [],
    created_at: new Date().toISOString(), event_time: new Date().toISOString(),
    ingestion_time: new Date().toISOString(), ...overrides,
  };
}

function similarMemory(overrides: Partial<SimilarMemory> = {}): SimilarMemory {
  return {
    id: 's-default', event_type: 'deep_talk', title: 'Similar',
    description: 'Semantically close to the current message.',
    emotional_weight: 3, tags: [], created_at: new Date().toISOString(),
    event_time: new Date().toISOString(), ingestion_time: new Date().toISOString(),
    similarity: 0.9, ...overrides,
  };
}

describe('retrieveRelevantMemories — widened contract', () => {
  beforeEach(() => {
    mockedSearch.mockReset();
  });

  it('splices in a similarity hit that is outside the original candidate set', async () => {
    const candidates = [node({ id: 'c1' }), node({ id: 'c2' })];
    mockedSearch.mockResolvedValue([
      similarMemory({ id: 'outside-1', title: 'The genuinely relevant old one' }),
    ]);

    const result = await retrieveRelevantMemories('u1', 'c1', candidates, 'do you remember...');

    expect(result.map(m => m.id)).toContain('outside-1');
    expect(result.find(m => m.id === 'outside-1')?.title).toBe('The genuinely relevant old one');
    // Original candidates are preserved too (appended after similarity hits).
    expect(result.map(m => m.id)).toEqual(expect.arrayContaining(['c1', 'c2']));
  });

  it('caps out-of-pool admissions at MAX_EXTRA_SIMILARITY_HITS (3)', async () => {
    const candidates = [node({ id: 'c1' }), node({ id: 'c2' })];
    mockedSearch.mockResolvedValue([
      similarMemory({ id: 'outside-1' }),
      similarMemory({ id: 'outside-2' }),
      similarMemory({ id: 'outside-3' }),
      similarMemory({ id: 'outside-4' }), // should be dropped — over the cap
      similarMemory({ id: 'outside-5' }), // should be dropped — over the cap
    ]);

    const result = await retrieveRelevantMemories('u1', 'c1', candidates, 'message');
    const ids = result.map(m => m.id);

    expect(ids).toContain('outside-1');
    expect(ids).toContain('outside-2');
    expect(ids).toContain('outside-3');
    expect(ids).not.toContain('outside-4');
    expect(ids).not.toContain('outside-5');
  });

  it('still reorders in-pool candidates by similarity rank (pre-existing behavior)', async () => {
    const candidates = [node({ id: 'c1', title: 'First' }), node({ id: 'c2', title: 'Second' })];
    // c2 is more similar than c1 — should come first in the result.
    mockedSearch.mockResolvedValue([
      similarMemory({ id: 'c2', similarity: 0.95 }),
      similarMemory({ id: 'c1', similarity: 0.4 }),
    ]);

    const result = await retrieveRelevantMemories('u1', 'c1', candidates, 'message');

    expect(result.map(m => m.id)).toEqual(['c2', 'c1']);
    // Re-hydrated from the caller's own full candidate object, not the
    // RPC's trimmed row — title should be the candidate's real title.
    expect(result[0].title).toBe('Second');
  });

  it('falls back to unmodified candidate order when pgvector finds nothing and no brain service is configured', async () => {
    const candidates = [node({ id: 'c1' }), node({ id: 'c2' }), node({ id: 'c3' })];
    mockedSearch.mockResolvedValue([]);

    const result = await retrieveRelevantMemories('u1', 'c1', candidates, 'message');

    expect(result).toEqual(candidates);
  });

  it('falls back cleanly when searchMemoriesBySimilarity throws', async () => {
    const candidates = [node({ id: 'c1' }), node({ id: 'c2' })];
    mockedSearch.mockRejectedValue(new Error('brain service down'));

    const result = await retrieveRelevantMemories('u1', 'c1', candidates, 'message');

    expect(result).toEqual(candidates);
  });

  it('short-circuits for fewer than 2 candidates without calling search', async () => {
    const candidates = [node({ id: 'only-one' })];

    const result = await retrieveRelevantMemories('u1', 'c1', candidates, 'message');

    expect(result).toEqual(candidates);
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
