// src/lib/ai/__tests__/semantic-cache-scoping.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cost audit (2026-08-23): semantic-cache.ts was fully disabled on 2026-08-08
// after its original design served one user's cached reply to a *different*
// user as their companion's own words — matching wasn't scoped by who was
// asking, just by (systemPrompt, near-duplicate message). Re-enabled
// 2026-08-23 scoped to a curated GENERIC_OPENERS allowlist shared cross-user.
//
// RE-SCOPED AGAIN (2026-09-05): every cache key (exact, LSH bands, word
// sets) is now namespaced by `${userId}:${characterId}` — see scopeOf() in
// semantic-cache.ts. That fixes the leak at the storage layer, so caching is
// no longer restricted to GENERIC_OPENERS; the MinHash/Jaccard near-
// duplicate layer (Layers 2/3) is back in use for any cacheable message.
//
// These tests pin the new hard boundary: a cache key/hit must never be
// reachable across two different userId values, even for byte-identical
// messages on the same character. If someone removes scope from a key or
// lets a candidate from another scope be read, this file should fail.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisGet      = vi.fn();
const redisSmembers = vi.fn();
const pipelineExec  = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/redis', () => ({
  redis: {
    get:       redisGet,
    smembers:  redisSmembers,
    pipeline: () => ({
      incr:      vi.fn().mockReturnThis(),
      expireat:  vi.fn().mockReturnThis(),
      set:       vi.fn().mockReturnThis(),
      sadd:      vi.fn().mockReturnThis(),
      expire:    vi.fn().mockReturnThis(),
      exec:      pipelineExec,
    }),
    del: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  bg: (label: string) => (err: unknown) => { void label; void err; },
}));

const base = { tier: 'free' as const, systemPrompt: 'sys', datingMode: false, hasMemory: false };

describe('semantic-cache.ts — per-user/per-character scoping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    redisGet.mockResolvedValue(null);
    redisSmembers.mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('is cacheable (non-null key) for a plain greeting', async () => {
    const { checkSemanticCache } = await import('../semantic-cache');
    const result = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'hi',
    });
    expect(result.hit).toBe(false);
    expect(result.key).not.toBeNull();
  });

  it('gives the same user the same key for synonyms that normalize identically', async () => {
    const { checkSemanticCache } = await import('../semantic-cache');
    const r1 = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'hey there',
    });
    const r2 = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'howdy',
    });
    expect(r1.key).not.toBeNull();
    expect(r2.key).not.toBeNull();
    expect(r1.key).toEqual(r2.key);
  });

  it('gives two different users two different keys for the byte-identical message', async () => {
    const { checkSemanticCache } = await import('../semantic-cache');
    const a = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'hi',
    });
    const b = await checkSemanticCache({
      ...base, userId: 'user-b', characterId: 'char-1', userMsg: 'hi',
    });
    expect(a.key).not.toBeNull();
    expect(b.key).not.toBeNull();
    expect(a.key).not.toEqual(b.key);
  });

  it('gives the same user two different keys for the same message on two different characters', async () => {
    const { checkSemanticCache } = await import('../semantic-cache');
    const c1 = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'hi',
    });
    const c2 = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-2', userMsg: 'hi',
    });
    expect(c1.key).not.toEqual(c2.key);
  });

  it('is now cacheable for a longer free-text message via the per-user LSH/Jaccard layer', async () => {
    const { checkSemanticCache } = await import('../semantic-cache');
    const result = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1',
      userMsg: 'I had a really rough day at work, my manager yelled at me in front of everyone',
    });
    // No longer a guaranteed miss-with-null-key — the message is eligible
    // for the per-user near-duplicate layer now that leaking cross-user is
    // structurally impossible (scoped keys).
    expect(result.key).not.toBeNull();
    expect(redisSmembers).toHaveBeenCalled();
  });

  it('never reads a candidate key belonging to a different scope during the LSH probe', async () => {
    // Simulate a corrupted/foreign band bucket that somehow contains a key
    // from a different user's scope — lshBestMatch must ignore it rather
    // than fetching and comparing against it.
    redisSmembers.mockResolvedValue(['ai:sresp:some-other-scope-hash:deadbeef']);
    const { checkSemanticCache } = await import('../semantic-cache');
    const result = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1',
      userMsg: 'a message long enough to enter the minhash path for sure',
    });
    expect(result.hit).toBe(false);
    // Only ever reads its own exact key up front — never fetches the
    // foreign-scope candidate's reply or word set.
    expect(redisGet).not.toHaveBeenCalledWith('ai:sresp:some-other-scope-hash:deadbeef');
    expect(redisGet).not.toHaveBeenCalledWith('ai:sresp:some-other-scope-hash:deadbeef:words');
    void result;
  });

  it('stays disabled for premium tier, dating mode, memory-enriched prompts, and long messages — even for a greeting', async () => {
    const { checkSemanticCache } = await import('../semantic-cache');
    const common = { userId: 'user-a', characterId: 'char-1' };

    const premium = await checkSemanticCache({
      ...base, ...common, tier: 'premium', userMsg: 'hi',
    });
    const dating = await checkSemanticCache({
      ...base, ...common, datingMode: true, userMsg: 'hi',
    });
    const memory = await checkSemanticCache({
      ...base, ...common, hasMemory: true, userMsg: 'hi',
    });
    const long = await checkSemanticCache({
      ...base, ...common, userMsg: 'hi '.repeat(200),
    });

    for (const r of [premium, dating, memory, long]) {
      expect(r.hit).toBe(false);
      expect(r.key).toBeNull();
    }
  });

  it("returns a hit only when Redis actually has a stored reply for this scope's key", async () => {
    redisGet.mockResolvedValueOnce('Hey! Good to hear from you ');
    const { checkSemanticCache } = await import('../semantic-cache');

    const result = await checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'hello',
    });

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.reply).toBe('Hey! Good to hear from you ');
      expect(result.mode).toBe('canonical');
    }
  });

  it('fails open to a miss (never throws) when Redis is unavailable', async () => {
    redisGet.mockRejectedValueOnce(new Error('redis down'));
    const { checkSemanticCache } = await import('../semantic-cache');

    await expect(checkSemanticCache({
      ...base, userId: 'user-a', characterId: 'char-1', userMsg: 'thanks',
    })).resolves.toEqual(expect.objectContaining({ hit: false }));
  });

  it('storeSemanticCache is a no-op for a null key (bypassed messages never get written)', async () => {
    const { storeSemanticCache } = await import('../semantic-cache');
    await storeSemanticCache({ key: null, words: new Set(['hi']), sig: null, bandKeys: null, reply: 'anything' });
    expect(pipelineExec).not.toHaveBeenCalled();
  });
});
