// src/__tests__/memory-tiers-long-term.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Companion to the short/medium-term tier tests — covers this tier's two
// riskiest behaviors: the near-duplicate dedup on write (a topic that keeps
// getting re-promoted should reinforce one row, not pile up near-identical
// ones — see isNearDuplicate()'s header comment) and the GDPR erasure hooks
// (clearLongTerm / deleteAllForUser) that api/user/delete and
// api/characters/[id]/memory-reset depend on.
//
// Backs the mock with a small in-memory fake table rather than a fully
// generic stub, since addLongTermMemory's dedup path calls
// getLongTermMemories() internally — a realistic round-trip is what's worth
// pinning here, not just "was insert called".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  user_id: string;
  character_id: string;
  headline: string;
  content: string;
  importance: number;
  source: string;
  origin_medium_term_id: string | null;
  reinforcement_count: number;
  created_at: string;
  last_reinforced_at: string;
}

let rows: Row[] = [];
let idCounter = 0;

function makeQuery() {
  const filters: Array<(r: Row) => boolean> = [];
  const orderings: Array<{ field: keyof Row; ascending: boolean }> = [];
  let limitN: number | undefined;
  let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let insertPayload: Partial<Row> = {};
  let updatePayload: Partial<Row> = {};

  function matched(): Row[] {
    return rows.filter(r => filters.every(f => f(r)));
  }

  function sortedAndLimited(): Row[] {
    let result = matched();
    for (const o of [...orderings].reverse()) {
      result = [...result].sort((a, b) => {
        const av = a[o.field] as number | string;
        const bv = b[o.field] as number | string;
        if (av < bv) return o.ascending ? -1 : 1;
        if (av > bv) return o.ascending ? 1 : -1;
        return 0;
      });
    }
    return limitN != null ? result.slice(0, limitN) : result;
  }

  async function resolve(single: boolean): Promise<{ data: unknown; error: null }> {
    if (mode === 'insert') {
      const now = new Date().toISOString();
      const row: Row = Object.assign(
        {
          id: `row_${++idCounter}`,
          reinforcement_count: 1,
          created_at: now,
          last_reinforced_at: now,
        },
        insertPayload,
      ) as Row;
      rows.push(row);
      return { data: single ? row : [row], error: null };
    }
    if (mode === 'update') {
      const targets = matched();
      targets.forEach(r => Object.assign(r, updatePayload));
      return { data: single ? targets[0] ?? null : targets, error: null };
    }
    if (mode === 'delete') {
      rows = rows.filter(r => !filters.every(f => f(r)));
      return { data: null, error: null };
    }
    const result = sortedAndLimited();
    return { data: single ? result[0] ?? null : result, error: null };
  }

  const api = {
    select: () => api,
    insert: (payload: Partial<Row>) => { mode = 'insert'; insertPayload = payload; return api; },
    update: (payload: Partial<Row>) => { mode = 'update'; updatePayload = payload; return api; },
    delete: () => { mode = 'delete'; return api; },
    eq: (field: string, value: unknown) => { filters.push(r => (r as unknown as Record<string, unknown>)[field] === value); return api; },
    order: (field: string, opts?: { ascending?: boolean }) => {
      orderings.push({ field: field as keyof Row, ascending: opts?.ascending ?? true });
      return api;
    },
    limit: (n: number) => { limitN = n; return api; },
    single: () => resolve(true),
    then: (onFulfilled: (v: { data: unknown; error: null }) => unknown) => resolve(false).then(onFulfilled),
  };
  return api;
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(() => makeQuery()) },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('memory-tiers/long-term-memory', () => {
  it('inserts a new row and returns it, converting 0-1 importance to the 1-10 DB scale', async () => {
    const { addLongTermMemory, getLongTermMemories } = await import('../lib/memory-tiers/long-term-memory');
    const result = await addLongTermMemory('user-lt-1', 'char-1', {
      headline: 'Loves stargazing on clear nights',
      content: 'They mentioned loving stargazing.',
      importance01: 0.8,
    });

    expect(result).not.toBeNull();
    expect(result?.importance).toBe(8);
    expect(result?.reinforcement_count).toBe(1);

    const stored = await getLongTermMemories('user-lt-1', 'char-1');
    expect(stored).toHaveLength(1);
  });

  it('reinforces an existing near-duplicate instead of inserting a second row', async () => {
    const { addLongTermMemory, getLongTermMemories } = await import('../lib/memory-tiers/long-term-memory');

    await addLongTermMemory('user-lt-2', 'char-1', {
      headline: 'Talked about starting a new job next month',
      content: 'c',
      importance01: 0.5,
    });
    const second = await addLongTermMemory('user-lt-2', 'char-1', {
      headline: 'Talked about starting a new job next month soon',
      content: 'c',
      importance01: 0.5,
    });

    const stored = await getLongTermMemories('user-lt-2', 'char-1');
    expect(stored).toHaveLength(1); // reinforced, not duplicated
    expect(second?.reinforcement_count).toBe(2);
  });

  it('does not merge headlines about clearly different topics', async () => {
    const { addLongTermMemory, getLongTermMemories } = await import('../lib/memory-tiers/long-term-memory');

    await addLongTermMemory('user-lt-3', 'char-1', {
      headline: 'Loves stargazing on clear nights',
      content: 'c',
      importance01: 0.5,
    });
    await addLongTermMemory('user-lt-3', 'char-1', {
      headline: 'Afraid of flying on airplanes',
      content: 'c',
      importance01: 0.5,
    });

    const stored = await getLongTermMemories('user-lt-3', 'char-1');
    expect(stored).toHaveLength(2);
  });

  it('getLongTermMemories orders by importance, then reinforcement, then recency (all descending)', async () => {
    const { addLongTermMemory, getLongTermMemories } = await import('../lib/memory-tiers/long-term-memory');

    await addLongTermMemory('user-lt-4', 'char-1', { headline: 'Prefers tea over coffee', content: 'c', importance01: 0.2 });
    await addLongTermMemory('user-lt-4', 'char-1', { headline: 'Terrified of deep water', content: 'c', importance01: 0.9 });

    const stored = await getLongTermMemories('user-lt-4', 'char-1');
    expect(stored[0].headline).toBe('Terrified of deep water');
  });

  it('clearLongTerm removes only the given user+character pair', async () => {
    const { addLongTermMemory, clearLongTerm, getLongTermMemories } = await import(
      '../lib/memory-tiers/long-term-memory'
    );

    await addLongTermMemory('user-lt-5', 'char-1', { headline: 'To be cleared', content: 'c', importance01: 0.5 });
    await addLongTermMemory('user-lt-5', 'char-2', { headline: 'A different companion, keep this', content: 'c', importance01: 0.5 });

    await clearLongTerm('user-lt-5', 'char-1');

    expect(await getLongTermMemories('user-lt-5', 'char-1')).toHaveLength(0);
    expect(await getLongTermMemories('user-lt-5', 'char-2')).toHaveLength(1);
  });

  it('deleteAllForUser (account-wide GDPR erasure) removes every character pair for that user', async () => {
    const { addLongTermMemory, deleteAllForUser, getLongTermMemories } = await import(
      '../lib/memory-tiers/long-term-memory'
    );

    await addLongTermMemory('user-lt-6', 'char-1', { headline: 'One', content: 'c', importance01: 0.5 });
    await addLongTermMemory('user-lt-6', 'char-2', { headline: 'Two', content: 'c', importance01: 0.5 });
    await addLongTermMemory('user-lt-other', 'char-1', { headline: 'Not this user', content: 'c', importance01: 0.5 });

    await deleteAllForUser('user-lt-6');

    expect(await getLongTermMemories('user-lt-6', 'char-1')).toHaveLength(0);
    expect(await getLongTermMemories('user-lt-6', 'char-2')).toHaveLength(0);
    expect(await getLongTermMemories('user-lt-other', 'char-1')).toHaveLength(1);
  });

  it('formatLongTermForPrompt renders headlines only, sorted by importance', async () => {
    const { formatLongTermForPrompt } = await import('../lib/memory-tiers/long-term-memory');
    const now = new Date().toISOString();
    const text = formatLongTermForPrompt([
      { id: '1', user_id: 'u', character_id: 'c', headline: 'Minor thing', content: 'x', importance: 2, source: 'promoted', origin_medium_term_id: null, reinforcement_count: 1, created_at: now, last_reinforced_at: now },
      { id: '2', user_id: 'u', character_id: 'c', headline: 'Major thing', content: 'x', importance: 9, source: 'promoted', origin_medium_term_id: null, reinforcement_count: 1, created_at: now, last_reinforced_at: now },
    ]);
    expect(text.indexOf('Major thing')).toBeLessThan(text.indexOf('Minor thing'));
  });
});
