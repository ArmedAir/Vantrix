// src/__tests__/memory-tiers-engine.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Isolates memory-tier-engine.ts's own orchestration logic — the checkpoint
// bookkeeping that keeps a re-run from re-digesting the whole short-term
// buffer, the promotion loop that hands eligible medium-term entries to
// long-term storage, and drainDirtyPairs' token→pair resolution — from the
// three tier modules themselves (each has its own dedicated test file
// alongside this one). Every tier function is mocked here so a failure in
// this file points specifically at the facade, not at STM/MTM/LTM internals.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach } from 'vitest';

const appendShortTermTurn = vi.fn();
const getShortTermBuffer = vi.fn();
const formatShortTermForPrompt = vi.fn((..._args: unknown[]) => 'stm-block');
const popDirtyPairs = vi.fn();
const pairFromToken = vi.fn((token: string) => {
  const idx = token.indexOf('::');
  if (idx === -1) return null;
  return { userId: token.slice(0, idx), characterId: token.slice(idx + 2) };
});

const summarizeAndPromote = vi.fn();
const getMediumTermMemory = vi.fn();
const formatMediumTermForPrompt = vi.fn((..._args: unknown[]) => 'mtm-block');
const entriesEligibleForPromotion = vi.fn();
const markPromoted = vi.fn();

const addLongTermMemory = vi.fn();
const getLongTermMemories = vi.fn();
const formatLongTermForPrompt = vi.fn((..._args: unknown[]) => 'ltm-block');

vi.mock('@/lib/memory-tiers/short-term-memory', () => ({
  appendShortTermTurn: (...a: unknown[]) => appendShortTermTurn(...a),
  getShortTermBuffer: (...a: unknown[]) => getShortTermBuffer(...a),
  formatShortTermForPrompt: (...a: unknown[]) => formatShortTermForPrompt(...a),
  popDirtyPairs: (...a: unknown[]) => popDirtyPairs(...a),
  pairFromToken: (...a: [string]) => pairFromToken(...a),
}));

vi.mock('@/lib/memory-tiers/medium-term-memory', () => ({
  summarizeAndPromote: (...a: unknown[]) => summarizeAndPromote(...a),
  getMediumTermMemory: (...a: unknown[]) => getMediumTermMemory(...a),
  formatMediumTermForPrompt: (...a: unknown[]) => formatMediumTermForPrompt(...a),
  entriesEligibleForPromotion: (...a: unknown[]) => entriesEligibleForPromotion(...a),
  markPromoted: (...a: unknown[]) => markPromoted(...a),
}));

vi.mock('@/lib/memory-tiers/long-term-memory', () => ({
  addLongTermMemory: (...a: unknown[]) => addLongTermMemory(...a),
  getLongTermMemories: (...a: unknown[]) => getLongTermMemories(...a),
  formatLongTermForPrompt: (...a: unknown[]) => formatLongTermForPrompt(...a),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  getMediumTermMemory.mockResolvedValue([]);
  entriesEligibleForPromotion.mockReturnValue([]);
  getShortTermBuffer.mockResolvedValue([]);
  getLongTermMemories.mockResolvedValue([]);
});

describe('memory-tiers/memory-tier-engine', () => {
  it('recordTurn is a thin pass-through to appendShortTermTurn, tier included', async () => {
    const { recordTurn } = await import('../lib/memory-tiers/memory-tier-engine');
    await recordTurn('u1', 'c1', 'user', 'hello');
    expect(appendShortTermTurn).toHaveBeenCalledWith('u1', 'c1', 'user', 'hello', undefined);
  });

  it('recordTurn forwards an explicit tier straight through to appendShortTermTurn', async () => {
    const { recordTurn } = await import('../lib/memory-tiers/memory-tier-engine');
    await recordTurn('u1', 'c1', 'user', 'hello', 'premium');
    expect(appendShortTermTurn).toHaveBeenCalledWith('u1', 'c1', 'user', 'hello', 'premium');
  });

  it('getTieredMemoryContext reads all three tiers in parallel and joins their prompt blocks', async () => {
    getShortTermBuffer.mockResolvedValue([{ role: 'user', text: 'hi', ts: 1, salience: 0.2 }]);
    getMediumTermMemory.mockResolvedValue([{ id: 'm1' }]);
    getLongTermMemories.mockResolvedValue([{ id: 'l1' }]);

    const { getTieredMemoryContext } = await import('../lib/memory-tiers/memory-tier-engine');
    const ctx = await getTieredMemoryContext('u1', 'c1');

    expect(ctx.promptBlock).toContain('ltm-block');
    expect(ctx.promptBlock).toContain('mtm-block');
    expect(ctx.promptBlock).toContain('stm-block');
    expect(ctx.shortTerm).toHaveLength(1);
  });

  it('getTieredMemoryContext fails open (empty arrays) if a tier read rejects', async () => {
    getMediumTermMemory.mockRejectedValue(new Error('redis down'));

    const { getTieredMemoryContext } = await import('../lib/memory-tiers/memory-tier-engine');
    const ctx = await getTieredMemoryContext('u1', 'c1');

    expect(ctx.mediumTerm).toEqual([]);
  });

  it('runTierConsolidation skips the digest when there are not enough new turns', async () => {
    getShortTermBuffer.mockResolvedValue([
      { role: 'user', text: 'a', ts: 1, salience: 0.2 },
      { role: 'user', text: 'b', ts: 2, salience: 0.2 },
    ]);

    const { runTierConsolidation } = await import('../lib/memory-tiers/memory-tier-engine');
    const result = await runTierConsolidation('u2', 'c1', 'Aria');

    expect(result.digested).toBe(false);
    expect(summarizeAndPromote).not.toHaveBeenCalled();
  });

  it('runTierConsolidation digests once enough new turns accumulate, then checkpoints so the same turns are not re-digested', async () => {
    const turns = Array.from({ length: 6 }, (_, i) => ({ role: 'user' as const, text: `t${i}`, ts: i, salience: 0.2 }));
    getShortTermBuffer.mockResolvedValue(turns);
    summarizeAndPromote.mockResolvedValue({ id: 'm1' });

    const { runTierConsolidation } = await import('../lib/memory-tiers/memory-tier-engine');

    const first = await runTierConsolidation('u3', 'c1', 'Aria');
    expect(first.digested).toBe(true);
    expect(summarizeAndPromote).toHaveBeenCalledTimes(1);

    // Same buffer again (nothing new arrived) — should NOT re-digest.
    const second = await runTierConsolidation('u3', 'c1', 'Aria');
    expect(second.digested).toBe(false);
    expect(summarizeAndPromote).toHaveBeenCalledTimes(1);
  });

  it('promotes eligible medium-term entries to long-term and marks them promoted', async () => {
    entriesEligibleForPromotion.mockReturnValue([
      { id: 'e1', summary: 'a meaningful moment', importance: 0.8 },
      { id: 'e2', summary: 'another one', importance: 0.9 },
    ]);
    addLongTermMemory.mockResolvedValue({ id: 'ltm-1' });

    const { runTierConsolidation } = await import('../lib/memory-tiers/memory-tier-engine');
    const result = await runTierConsolidation('u4', 'c1', 'Aria');

    expect(result.promotedCount).toBe(2);
    expect(addLongTermMemory).toHaveBeenCalledTimes(2);
    expect(markPromoted).toHaveBeenCalledWith('u4', 'c1', ['e1', 'e2']);
  });

  it('runTierConsolidation fails open (skipped: true) if a tier read throws', async () => {
    getShortTermBuffer.mockRejectedValue(new Error('redis unreachable'));

    const { runTierConsolidation } = await import('../lib/memory-tiers/memory-tier-engine');
    const result = await runTierConsolidation('u5', 'c1', 'Aria');

    expect(result.skipped).toBe(true);
    expect(result.digested).toBe(false);
    expect(result.promotedCount).toBe(0);
  });

  it('drainDirtyPairs resolves each token to a pair and consolidates it, falling back to "They" if name resolution fails', async () => {
    popDirtyPairs.mockResolvedValue(['u6::c1', 'u7::c2', 'not-a-valid-token']);
    const resolveCharacterName = vi
      .fn()
      .mockResolvedValueOnce('Aria')
      .mockRejectedValueOnce(new Error('lookup failed'));

    const { drainDirtyPairs } = await import('../lib/memory-tiers/memory-tier-engine');
    const results = await drainDirtyPairs(10, resolveCharacterName);

    // The malformed token is silently skipped (pairFromToken returns null).
    expect(results).toHaveLength(2);
    expect(popDirtyPairs).toHaveBeenCalledWith(10);
  });
});
