// src/__tests__/memory-tiers-short-term.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// The memory-tiers subsystem (src/lib/memory-tiers/) had no dedicated unit
// tests despite being on the live chat path (recordTurn() is called from both
// chat/stream/route.ts and queue/worker.ts) — only an indirect mock in
// arch-14-companion-context-assembly.test.ts. This pins the short-term tier's
// actual behavior: buffer round-trip, the MAX_TURNS cap, dirty-set marking
// for the consolidation cron, and the GDPR-erasure helper's per-user filter.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
const sets = new Map<string, Set<string>>();

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
    sadd: vi.fn((key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
      return Promise.resolve(1);
    }),
    srem: vi.fn((key: string, ...members: string[]) => {
      const s = sets.get(key);
      if (!s) return Promise.resolve(0);
      let removed = 0;
      for (const m of members) if (s.delete(m)) removed++;
      return Promise.resolve(removed);
    }),
    smembers: vi.fn((key: string) => Promise.resolve(Array.from(sets.get(key) ?? []))),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  store.clear();
  sets.clear();
  vi.clearAllMocks();
});

describe('memory-tiers/short-term-memory', () => {
  it('round-trips a buffer through append + get', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    await appendShortTermTurn('user-1', 'char-1', 'user', 'hello there');
    await appendShortTermTurn('user-1', 'char-1', 'character', 'hi! how are you?');

    const buffer = await getShortTermBuffer('user-1', 'char-1');
    expect(buffer).toHaveLength(2);
    expect(buffer[0]).toMatchObject({ role: 'user', text: 'hello there' });
    expect(buffer[1]).toMatchObject({ role: 'character', text: 'hi! how are you?' });
  });

  it('caps the buffer at 30 turns on free tier, keeping the most recent (pure recency, unchanged from pre-tiering behavior)', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    for (let i = 0; i < 35; i++) {
      await appendShortTermTurn('user-2', 'char-1', 'user', `turn ${i}`);
    }
    const buffer = await getShortTermBuffer('user-2', 'char-1');
    expect(buffer).toHaveLength(30);
    expect(buffer[0].text).toBe('turn 5'); // oldest 5 dropped
    expect(buffer[buffer.length - 1].text).toBe('turn 34');
    expect(buffer.every(t => t.pinned === false)).toBe(true);
  });

  it('defaults to free-tier limits when no tier is passed', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    for (let i = 0; i < 35; i++) {
      await appendShortTermTurn('user-2b', 'char-1', 'user', `turn ${i}`);
    }
    const buffer = await getShortTermBuffer('user-2b', 'char-1');
    expect(buffer).toHaveLength(30);
  });

  it('premium tier caps the buffer at 60 turns instead of 30', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    for (let i = 0; i < 65; i++) {
      await appendShortTermTurn('user-2c', 'char-1', 'user', `turn ${i}`, 'premium');
    }
    const buffer = await getShortTermBuffer('user-2c', 'char-1');
    expect(buffer).toHaveLength(60);
  });

  it('premium tier protects a highly salient turn from recency eviction; free tier does not', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    const disclosure = "I'm scared to tell anyone this, but I actually lost my job today and I don't know what to do.";

    // Free tier: 30-cap, pure recency — the early disclosure gets pushed out.
    await appendShortTermTurn('user-5f', 'char-1', 'user', disclosure);
    for (let i = 0; i < 32; i++) {
      await appendShortTermTurn('user-5f', 'char-1', 'user', `ok ${i}`);
    }
    const freeBuffer = await getShortTermBuffer('user-5f', 'char-1');
    expect(freeBuffer.some(t => t.text === disclosure)).toBe(false);

    // Premium tier: same shape of conversation, but the disclosure survives
    // pinned, protected from the flood of low-salience filler after it.
    await appendShortTermTurn('user-5p', 'char-1', 'user', disclosure, 'premium');
    for (let i = 0; i < 65; i++) {
      await appendShortTermTurn('user-5p', 'char-1', 'user', `ok ${i}`, 'premium');
    }
    const premiumBuffer = await getShortTermBuffer('user-5p', 'char-1');
    const survived = premiumBuffer.find(t => t.text === disclosure);
    expect(survived).toBeDefined();
    expect(survived?.pinned).toBe(true);
    expect(survived?.flags).toContain('emotional');
  });

  it('premium tier allows longer per-turn text than free tier', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    const longText = 'x'.repeat(1200);

    await appendShortTermTurn('user-6f', 'char-1', 'user', longText);
    const freeBuffer = await getShortTermBuffer('user-6f', 'char-1');
    expect(freeBuffer[0].text.length).toBe(800); // truncated at free's maxTextLen

    await appendShortTermTurn('user-6p', 'char-1', 'user', longText, 'premium');
    const premiumBuffer = await getShortTermBuffer('user-6p', 'char-1');
    expect(premiumBuffer[0].text.length).toBe(1200); // fits within premium's maxTextLen
  });

  it('marks the pair dirty on every write, for the consolidation cron to drain', async () => {
    const { appendShortTermTurn, popDirtyPairs, pairFromToken } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    await appendShortTermTurn('user-3', 'char-9', 'user', 'hey');

    const tokens = await popDirtyPairs(10);
    expect(tokens).toContain('user-3::char-9');
    expect(pairFromToken('user-3::char-9')).toEqual({ userId: 'user-3', characterId: 'char-9' });

    // popDirtyPairs removes what it returns — a second pop should be empty.
    const second = await popDirtyPairs(10);
    expect(second).not.toContain('user-3::char-9');
  });

  it('clearShortTerm removes both the buffer and its dirty-set membership', async () => {
    const { appendShortTermTurn, clearShortTerm, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    await appendShortTermTurn('user-4', 'char-1', 'user', 'remember this');
    await clearShortTerm('user-4', 'char-1');

    expect(await getShortTermBuffer('user-4', 'char-1')).toEqual([]);
    const { redis } = await import('@/lib/redis');
    expect(redis.srem).toHaveBeenCalledWith('vantrix:tier:dirty-pairs', 'user-4::char-1');
  });

  it('removeUserDirtyPairs only strips tokens for the given user, not other users sharing the set', async () => {
    const { appendShortTermTurn, removeUserDirtyPairs, popDirtyPairs } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    await appendShortTermTurn('user-a', 'char-1', 'user', 'hi');
    await appendShortTermTurn('user-b', 'char-1', 'user', 'hi');

    const removed = await removeUserDirtyPairs('user-a');
    expect(removed).toBe(1);

    const remaining = await popDirtyPairs(10);
    expect(remaining).toEqual(['user-b::char-1']);
  });

  it('scoreSalience gives emotionally-charged, longer, question-bearing text a higher score than flat text', async () => {
    const { scoreSalience } = await import('../lib/memory-tiers/short-term-memory');
    const flat = scoreSalience('ok');
    const rich = scoreSalience(
      "I'm scared about tomorrow, is that normal? I've never felt this worried before."
    );
    expect(rich).toBeGreaterThan(flat);
    expect(rich).toBeLessThanOrEqual(1);
    expect(flat).toBeGreaterThanOrEqual(0);
  });

  it('formatShortTermForPrompt returns empty string for an empty buffer and a labeled transcript otherwise', async () => {
    const { formatShortTermForPrompt } = await import('../lib/memory-tiers/short-term-memory');
    expect(formatShortTermForPrompt([])).toBe('');

    const text = formatShortTermForPrompt([
      { role: 'user', text: 'hey', ts: 1, salience: 0.2, flags: [], pinned: false },
      { role: 'character', text: 'hey yourself', ts: 2, salience: 0.2, flags: [], pinned: false },
    ]);
    expect(text).toContain('User: hey');
    expect(text).toContain('You: hey yourself');
    expect(text).not.toContain('Worth remembering');
  });

  it('formatShortTermForPrompt surfaces pinned turns in their own section, separate from the recent window', async () => {
    const { formatShortTermForPrompt } = await import('../lib/memory-tiers/short-term-memory');

    const text = formatShortTermForPrompt([
      { role: 'user', text: 'I lost my job today', ts: 1, salience: 0.8, flags: ['emotional'], pinned: true },
      { role: 'user', text: 'hey', ts: 2, salience: 0.2, flags: [], pinned: false },
    ]);

    expect(text).toContain('Worth remembering from earlier in this conversation:');
    expect(text).toContain('User: I lost my job today');
    expect(text).toContain('This conversation more recently:');
    expect(text).toContain('User: hey');
  });

  it('tags stored turns with the flags that drove their salience score', async () => {
    const { appendShortTermTurn, getShortTermBuffer } = await import(
      '../lib/memory-tiers/short-term-memory'
    );
    await appendShortTermTurn('user-7', 'char-1', 'user', "Is that normal? I'm worried about it.");
    await appendShortTermTurn('user-7', 'char-1', 'user', "I promise I'll be there next time.");
    await appendShortTermTurn('user-7', 'char-1', 'user', 'plain small talk');

    const buffer = await getShortTermBuffer('user-7', 'char-1');
    expect(buffer[0].flags).toEqual(expect.arrayContaining(['question', 'emotional']));
    expect(buffer[1].flags).toEqual(expect.arrayContaining(['commitment']));
    expect(buffer[2].flags).toEqual([]);
  });

  it('getShortTermTierConfig reports bigger limits for premium than free', async () => {
    const { getShortTermTierConfig } = await import('../lib/memory-tiers/short-term-memory');
    const free = getShortTermTierConfig('free');
    const premium = getShortTermTierConfig('premium');
    expect(premium.maxTurns).toBeGreaterThan(free.maxTurns);
    expect(premium.ttlSeconds).toBeGreaterThan(free.ttlSeconds);
    expect(premium.maxTextLen).toBeGreaterThan(free.maxTextLen);
    expect(premium.protectedSlots).toBeGreaterThan(free.protectedSlots);
    expect(free.protectedSlots).toBe(0);
  });
});
