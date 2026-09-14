// src/lib/ai/__tests__/memory-graph-format-prompt-ordering.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// formatMemoryGraphForPrompt() used to unconditionally re-sort its input by
// emotional_weight then recency before capping to 8 — silently discarding
// whatever order the caller arrived with. That defeated two upstream
// upgrades whose entire point is reordering this list before it gets here:
// companion-context.ts's FEATURE-7 (Invisible Memory), which widened the
// fetched pool to 30 specifically so a relevant memory could win a slot in
// the top-8 shown to the model, and semantic-memory.ts's
// retrieveRelevantMemories(), which does real pgvector-similarity reordering
// against the current message. These tests lock the fix: the function must
// now trust caller-provided order and only cap the count.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';
import { formatMemoryGraphForPrompt } from '../memory-graph';
import type { MemoryNode } from '../memory-graph';

function node(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id:               'm-default',
    event_type:       'daily_life',
    title:            'Untitled',
    description:      'Nothing in particular.',
    emotional_weight: 5,
    tags:             [],
    created_at:       new Date().toISOString(),
    event_time:       new Date().toISOString(),
    ingestion_time:   new Date().toISOString(),
    ...overrides,
  };
}

describe('formatMemoryGraphForPrompt — order preservation', () => {
  it('keeps a low-weight, old memory in the output when the caller placed it first', () => {
    // The exact failure mode this fixes: a semantically-relevant hit that
    // pgvector/emotion-bias ranked first, but that would never survive an
    // internal weight+recency re-sort against 8 higher-weight, more recent
    // memories.
    const relevantButLowWeight = node({
      id: 'relevant-old', title: 'The one that matters right now',
      description: 'Directly about what the user just said.',
      emotional_weight: 2,
      event_time: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString(), // ~10 months ago
    });
    const highWeightRecent = Array.from({ length: 8 }, (_, i) => node({
      id: `hw-${i}`, title: `High weight memory ${i}`,
      emotional_weight: 10,
      event_time: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(), // hours ago
    }));

    const out = formatMemoryGraphForPrompt([relevantButLowWeight, ...highWeightRecent]);

    expect(out).toContain('The one that matters right now');
  });

  it('caps output at 8 memories, taking the first 8 in caller order (not re-sorted)', () => {
    const memories = Array.from({ length: 12 }, (_, i) => node({
      id: `m-${i}`, title: `Memory ${i}`,
      // Deliberately ascending weight so a weight-based sort would reverse
      // this order — if the fix regresses back to re-sorting, this test's
      // second assertion (memory 11 excluded) would fail.
      emotional_weight: i + 1 > 10 ? 10 : i + 1,
      event_time: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const out = formatMemoryGraphForPrompt(memories);

    for (let i = 0; i < 8; i++) expect(out).toContain(`Memory ${i}`);
    for (let i = 8; i < 12; i++) expect(out).not.toContain(`Memory ${i}`);
  });

  it('returns empty string for an empty list', () => {
    expect(formatMemoryGraphForPrompt([])).toBe('');
  });

  it('still uses event_time (not ingestion_time) for the displayed recency label', () => {
    const memory = node({
      title: 'Late disclosure',
      description: 'Told me something that happened a while back.',
      event_time: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // ~20 days ago
      ingestion_time: new Date().toISOString(), // learned just now
    });

    const out = formatMemoryGraphForPrompt([memory]);

    expect(out).toContain('weeks ago');
    expect(out).not.toContain('today');
  });
});
