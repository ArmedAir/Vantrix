/**
 * Curator alias translation.
 *
 * The curator used to send 36-char UUIDs to the model and require them echoed
 * back for every candidate. It now sends short numeric aliases (1..N) and
 * translates the reply back to ids BEFORE the permutation gate and the cache.
 * These tests pin that the trust rules did not loosen: nothing outside the
 * shortlist can ever appear, a bad reply degrades to the deterministic order,
 * and the cache stays id-based (so entries written before this change keep
 * working and vice versa).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyCuration, fromAliasResponse, type CuratorCandidate,
} from '../lib/recommendations/curator-logic';

const uuid = (i: number) => `8f14e45f-ceea-4${String(i).padStart(3, '0')}-a1b2-0123456789ab`;
const mk = (n: number): CuratorCandidate[] => Array.from({ length: n }, (_, i) => ({
  id: uuid(i + 1), name: `Char ${i + 1}`, archetype: i % 2 ? 'Rebel' : 'Sage',
  tags: ['a', 'b', 'c', 'd', 'e', 'f'], opening_line: `opener ${i + 1}`,
}));

describe('fromAliasResponse', () => {
  const list = mk(4);

  it('maps aliases back to the real ids and carries reasons through', () => {
    const r = fromAliasResponse(list, { order: [{ n: 3, reason: 'Fits your taste' }, { n: 1 }, { n: 4 }, { n: 2 }] });
    expect(r?.order.map(o => o.id)).toEqual([list[2]!.id, list[0]!.id, list[3]!.id, list[1]!.id]);
    expect(r?.order[0]?.reason).toBe('Fits your taste');
  });

  it.each([
    ['zero', 0], ['negative', -1], ['past the end', 5], ['far past the end', 999],
  ])('discards the whole reply when an alias is out of range (%s)', (_label, n) => {
    expect(fromAliasResponse(list, { order: [{ n: 1 }, { n: 2 }, { n: 3 }, { n }] })).toBeNull();
  });

  it('discards the whole reply when an alias is not an integer', () => {
    expect(fromAliasResponse(list, { order: [{ n: 1.5 }, { n: 2 }, { n: 3 }, { n: 4 }] })).toBeNull();
    expect(fromAliasResponse(list, { order: [{ n: NaN }, { n: 2 }, { n: 3 }, { n: 4 }] })).toBeNull();
  });

  it('still lets the permutation gate reject duplicates and omissions (trust rule unchanged)', () => {
    const det = list.map(c => c.id);
    const dup = fromAliasResponse(list, { order: [{ n: 1 }, { n: 1 }, { n: 2 }, { n: 3 }] })!;
    expect(applyCuration(list, det, dup)).toBeNull();
    const omit = fromAliasResponse(list, { order: [{ n: 1 }, { n: 2 }, { n: 3 }] })!;
    expect(applyCuration(list, det, omit)).toBeNull();
    const good = fromAliasResponse(list, { order: [{ n: 4 }, { n: 3 }, { n: 2 }, { n: 1 }] })!;
    expect(applyCuration(list, det, good)?.orderedIds).toEqual([...det].reverse());
  });

  it('can never introduce an id that was not in the shortlist', () => {
    for (const n of [-5, 0, 5, 100, 1e9]) {
      const r = fromAliasResponse(list, { order: [{ n }] });
      if (r) throw new Error(`alias ${n} should have been rejected`);
    }
  });
});

// ── curateForUser integration ------------------------------------------------

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  brain: vi.fn(),
}));
vi.mock('@/lib/redis', () => ({
  redis: {
    get: async (k: string) => (h.store.has(k) ? h.store.get(k) : null),
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (o?.nx && h.store.has(k)) return null;
      h.store.set(k, v); return 'OK';
    },
    del: async (k: string) => { h.store.delete(k); return 1; },
  },
  parseRedisJson: (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v),
}));
vi.mock('@/env', () => ({ env: { CURATOR_DAILY_AI_CALLS: '600' } }));
vi.mock('@/lib/logger', () => ({ logger: { warn() {}, info() {}, error() {} } }));
vi.mock('@/lib/ai/groq-brain', () => ({ brainJSON: (...a: unknown[]) => h.brain(...a) }));

describe('curateForUser with aliases', () => {
  const cands = mk(6);
  const weights = new Map([['romance', 3]]);
  const promptOf = () => h.brain.mock.calls[0]![0] as { system: string; user: string; schema: { safeParse: (v: unknown) => { success: boolean } } };

  beforeEach(() => { h.store.clear(); h.brain.mockReset(); });

  it('sends numeric aliases and NO ids to the model', async () => {
    h.brain.mockResolvedValue({ ok: false, reason: 'budget' });
    const { curateForUser } = await import('../lib/recommendations/ai-curator');
    await curateForUser('u1', cands, weights);

    const { system, user } = promptOf();
    const items = JSON.parse(user).shortlist as Record<string, unknown>[];
    expect(items.map(i => i.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const it of items) expect(it).not.toHaveProperty('id');
    expect(user).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no UUID anywhere in the prompt
    expect(system).toContain('"n"');
    expect(system).not.toContain('"id"');
  });

  it('the response schema accepts aliases and rejects the old id-shaped reply', async () => {
    h.brain.mockResolvedValue({ ok: false, reason: 'budget' });
    const { curateForUser } = await import('../lib/recommendations/ai-curator');
    await curateForUser('u1', cands, weights);
    const { schema } = promptOf();
    expect(schema.safeParse({ order: [{ n: 1, reason: 'x' }, { n: 2 }] }).success).toBe(true);
    expect(schema.safeParse({ order: [{ id: 'abc' }] }).success).toBe(false);
  });

  it('translates the reply to ids, applies it, and caches the ID-based shape', async () => {
    h.brain.mockResolvedValue({
      ok: true, model: 'm', latencyMs: 5, tokens: 100,
      data: { order: [{ n: 3, reason: 'Fits your slow-burn taste' }, { n: 1 }, { n: 2 }, { n: 4 }, { n: 5 }, { n: 6 }] },
    });
    const { curateForUser } = await import('../lib/recommendations/ai-curator');
    const r = await curateForUser('u1', cands, weights);

    expect(r.wasCurated).toBe(true);
    expect(r.orderedIds.slice(0, 3)).toEqual([cands[2]!.id, cands[0]!.id, cands[1]!.id]);
    expect(r.reasons.get(cands[2]!.id)).toBe('Fits your slow-burn taste');

    const cachedKey = [...h.store.keys()].find(k => k.startsWith('ai-curator:v2:') && !k.endsWith(':lock'));
    const cached = JSON.parse(h.store.get(cachedKey!) as string);
    expect(cached.order[0]).toEqual({ id: cands[2]!.id, reason: 'Fits your slow-burn taste' });
    expect(cached.order[0]).not.toHaveProperty('n');
  });

  it('serves an id-based cache entry written by the previous version, without calling the brain', async () => {
    h.brain.mockResolvedValue({
      ok: true, model: 'm', latencyMs: 5, tokens: 100,
      data: { order: cands.map((_, i) => ({ n: i + 1 })) },
    });
    const { curateForUser } = await import('../lib/recommendations/ai-curator');
    await curateForUser('u1', cands, weights); // populates the segment cache
    const cachedKey = [...h.store.keys()].find(k => k.startsWith('ai-curator:v2:') && !k.endsWith(':lock'));

    // Simulate an entry the OLD code wrote: id-shaped, reversed order.
    h.store.set(cachedKey!, JSON.stringify({ order: [...cands].reverse().map(c => ({ id: c.id })) }));
    h.brain.mockClear();

    const r = await curateForUser('u2', cands, weights); // same segment
    expect(h.brain).not.toHaveBeenCalled();
    expect(r.orderedIds).toEqual([...cands].reverse().map(c => c.id));
  });

  it.each([
    ['an alias past the end', [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }, { n: 7 }]],
    ['a duplicate alias', [{ n: 1 }, { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }]],
    ['a missing item', [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }]],
  ])('falls back to the deterministic order on %s, and caches nothing', async (_label, order) => {
    h.brain.mockResolvedValue({ ok: true, model: 'm', latencyMs: 5, tokens: 100, data: { order } });
    const { curateForUser } = await import('../lib/recommendations/ai-curator');
    const r = await curateForUser('u1', cands, weights);

    expect(r.wasCurated).toBe(false);
    expect(r.orderedIds).toEqual(cands.map(c => c.id));
    expect([...h.store.keys()].filter(k => k.startsWith('ai-curator:v2:') && !k.endsWith(':lock'))).toHaveLength(0);
  });
});
