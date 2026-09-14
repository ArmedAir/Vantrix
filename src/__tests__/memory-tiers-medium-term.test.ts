// src/__tests__/memory-tiers-medium-term.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Companion to memory-tiers-short-term.test.ts — covers summarizeAndPromote's
// merge-vs-append logic (the part of this tier most likely to silently
// misbehave, since it decides whether a new digest folds into an existing
// entry or becomes a new one), the AI-failure heuristic fallback that keeps
// the tier populated when generateStructured() errors, and the
// importance/reinforcement promotion gate runTierConsolidation() relies on.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ShortTermTurn } from '../lib/memory-tiers/short-term-memory';

const store = new Map<string, string>();

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const generateStructuredMock = vi.fn();
vi.mock('@/lib/ai/capability', () => ({
  generateStructured: (...args: unknown[]) => generateStructuredMock(...args),
}));

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

function turn(text: string, role: ShortTermTurn['role'] = 'user'): ShortTermTurn {
  return { role, text, ts: Date.now(), salience: 0.5, flags: [], pinned: false };
}

describe('memory-tiers/medium-term-memory', () => {
  it('returns null without enough turns to digest (below MIN_TURNS_TO_DIGEST)', async () => {
    const { summarizeAndPromote } = await import('../lib/memory-tiers/medium-term-memory');
    const result = await summarizeAndPromote('u1', 'c1', 'Aria', [turn('hi'), turn('hey')]);
    expect(result).toBeNull();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it('creates a new entry from the AI digest when none exists yet', async () => {
    generateStructuredMock.mockResolvedValueOnce({
      summary: 'They talked about starting a new job.',
      topics: ['career'],
      importance: 0.4,
    });

    const { summarizeAndPromote, getMediumTermMemory } = await import(
      '../lib/memory-tiers/medium-term-memory'
    );
    const turns = [turn('I got a new job'), turn('nice!'), turn('starts monday'), turn('good luck')];
    const entry = await summarizeAndPromote('u2', 'c1', 'Aria', turns);

    expect(entry).not.toBeNull();
    expect(entry?.summary).toBe('They talked about starting a new job.');
    expect(entry?.reinforcedCount).toBe(1);
    expect(entry?.promotedToLongTerm).toBe(false);

    const stored = await getMediumTermMemory('u2', 'c1');
    expect(stored).toHaveLength(1);
  });

  it('merges into an existing entry sharing a topic, bumping importance and reinforcedCount', async () => {
    generateStructuredMock
      .mockResolvedValueOnce({ summary: 'First digest about career.', topics: ['career'], importance: 0.3 })
      .mockResolvedValueOnce({ summary: 'Second digest, still career.', topics: ['career'], importance: 0.5 });

    const { summarizeAndPromote, getMediumTermMemory } = await import(
      '../lib/memory-tiers/medium-term-memory'
    );
    const turns = [turn('a'), turn('b'), turn('c'), turn('d')];

    await summarizeAndPromote('u3', 'c1', 'Aria', turns);
    const second = await summarizeAndPromote('u3', 'c1', 'Aria', turns);

    const stored = await getMediumTermMemory('u3', 'c1');
    expect(stored).toHaveLength(1); // merged, not appended
    expect(second?.reinforcedCount).toBe(2);
    expect(second?.summary).toBe('Second digest, still career.'); // most recent wins for display
    expect(second?.importance).toBeCloseTo(Math.min(1, Math.max(0.3, 0.5) + 0.1), 5);
  });

  it('appends a separate entry for a digest that shares no topic with existing entries', async () => {
    generateStructuredMock
      .mockResolvedValueOnce({ summary: 'About career.', topics: ['career'], importance: 0.3 })
      .mockResolvedValueOnce({ summary: 'About a trip.', topics: ['travel'], importance: 0.3 });

    const { summarizeAndPromote, getMediumTermMemory } = await import(
      '../lib/memory-tiers/medium-term-memory'
    );
    const turns = [turn('a'), turn('b'), turn('c'), turn('d')];

    await summarizeAndPromote('u4', 'c1', 'Aria', turns);
    await summarizeAndPromote('u4', 'c1', 'Aria', turns);

    const stored = await getMediumTermMemory('u4', 'c1');
    expect(stored).toHaveLength(2);
  });

  it('falls back to the heuristic digest (still produces an entry) when the AI call fails', async () => {
    generateStructuredMock.mockRejectedValueOnce(new Error('provider down'));

    const { summarizeAndPromote } = await import('../lib/memory-tiers/medium-term-memory');
    const turns = [
      turn("I'm really worried about my exam tomorrow, is that normal?"),
      turn('totally normal'),
      turn('thanks, that helps'),
      turn('anytime'),
    ];
    const entry = await summarizeAndPromote('u5', 'c1', 'Aria', turns);

    expect(entry).not.toBeNull();
    expect(entry?.summary.length).toBeGreaterThan(0);
    expect(entry?.topics).toEqual(['general']);
  });

  it('entriesEligibleForPromotion selects by importance OR reinforcement threshold, excluding already-promoted', async () => {
    const { entriesEligibleForPromotion, LTM_IMPORTANCE_THRESHOLD, LTM_REINFORCEMENT_THRESHOLD } =
      await import('../lib/memory-tiers/medium-term-memory');

    const base = {
      id: 'x', summary: 's', topics: [], turnsCovered: 1, firstTurnAt: 0, lastTurnAt: 0,
      createdAt: 0, updatedAt: 0,
    };
    const entries = [
      { ...base, id: 'high-importance', importance: LTM_IMPORTANCE_THRESHOLD, reinforcedCount: 1, promotedToLongTerm: false },
      { ...base, id: 'high-reinforcement', importance: 0.1, reinforcedCount: LTM_REINFORCEMENT_THRESHOLD, promotedToLongTerm: false },
      { ...base, id: 'neither', importance: 0.2, reinforcedCount: 1, promotedToLongTerm: false },
      { ...base, id: 'already-promoted', importance: 0.9, reinforcedCount: 5, promotedToLongTerm: true },
    ];

    const eligible = entriesEligibleForPromotion(entries).map(e => e.id);
    expect(eligible).toContain('high-importance');
    expect(eligible).toContain('high-reinforcement');
    expect(eligible).not.toContain('neither');
    expect(eligible).not.toContain('already-promoted');
  });

  it('formatMediumTermForPrompt excludes already-promoted entries', async () => {
    const { formatMediumTermForPrompt } = await import('../lib/memory-tiers/medium-term-memory');
    const base = {
      id: 'x', topics: [], turnsCovered: 1, firstTurnAt: 0, lastTurnAt: 0,
      createdAt: 0, updatedAt: 0, reinforcedCount: 1,
    };
    const text = formatMediumTermForPrompt([
      { ...base, id: 'a', summary: 'still active', importance: 0.5, promotedToLongTerm: false },
      { ...base, id: 'b', summary: 'already graduated', importance: 0.9, promotedToLongTerm: true },
    ]);
    expect(text).toContain('still active');
    expect(text).not.toContain('already graduated');
  });

  it('clearMediumTerm deletes the pair key', async () => {
    const { clearMediumTerm } = await import('../lib/memory-tiers/medium-term-memory');
    await clearMediumTerm('u6', 'c1');
    const { redis } = await import('@/lib/redis');
    expect(redis.del).toHaveBeenCalledWith('vantrix:tier:mtm:u6:c1');
  });
});
