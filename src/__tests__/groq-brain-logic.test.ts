/**
 * Pure-logic tests for the Groq brain layer — the rules that decide whether an
 * LLM's answer is trusted (curator permutation gate) and what the homepage is
 * allowed to show (rotation sanitizer). No Redis / Supabase / Groq needed.
 */
import { describe, it, expect } from 'vitest';
import {
  applyCuration, fnv1a, hashIds, tasteSignature, topTasteTags,
  type CuratorCandidate,
} from '../lib/recommendations/curator-logic';
import {
  baseScore, deterministicPicks, sanitizePicks, MAX_CARRY_OVER_SHARE,
  type RotationCandidate,
} from '../lib/curator/rotation-logic';

const cand = (id: string): CuratorCandidate =>
  ({ id, name: id, archetype: null, tags: null, opening_line: null });

describe('curator-logic — permutation trust gate', () => {
  const shortlist = ['a', 'b', 'c', 'd'].map(cand);
  const det = ['a', 'b', 'c', 'd', 'e', 'f']; // e, f were beyond the shortlist

  it('accepts an exact permutation and appends unseen remainder in original order', () => {
    const r = applyCuration(shortlist, det, { order: [{ id: 'c', reason: ' Witty banter ' }, { id: 'a' }, { id: 'd' }, { id: 'b' }] });
    expect(r?.orderedIds).toEqual(['c', 'a', 'd', 'b', 'e', 'f']);
    expect(r?.reasons.get('c')).toBe('Witty banter');
    expect(r?.wasCurated).toBe(true);
  });

  it('rejects an invented id', () => {
    expect(applyCuration(shortlist, det, { order: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'zzz' }] })).toBeNull();
  });
  it('rejects an omitted id', () => {
    expect(applyCuration(shortlist, det, { order: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })).toBeNull();
  });
  it('rejects a duplicated id', () => {
    expect(applyCuration(shortlist, det, { order: [{ id: 'a' }, { id: 'a' }, { id: 'c' }, { id: 'd' }] })).toBeNull();
  });
  it('caps reason length at 60 chars', () => {
    const r = applyCuration(shortlist, det, { order: [{ id: 'a', reason: 'x'.repeat(200) }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
    expect(r?.reasons.get('a')?.length).toBe(60);
  });
});

describe('curator-logic — segment keys', () => {
  it('hashIds is order-independent and content-sensitive', () => {
    expect(hashIds(['a', 'b', 'c'])).toBe(hashIds(['c', 'a', 'b']));
    expect(hashIds(['a', 'b', 'c'])).not.toBe(hashIds(['a', 'b', 'd']));
  });
  it('fnv1a is stable', () => {
    expect(fnv1a('vantrix')).toBe(fnv1a('vantrix'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });
  it('users with the same top tags share a segment regardless of weights/order', () => {
    const u1 = new Map([['archetype:romantic', 9], ['witty', 5], ['slow-burn', 3]]);
    const u2 = new Map([['slow-burn', 30], ['archetype:romantic', 2], ['witty', 1]]);
    expect(tasteSignature(u1)).toBe(tasteSignature(u2));
  });
  it('a different taste lands in a different segment; empty taste is cold-start', () => {
    expect(tasteSignature(new Map([['x', 1]]))).not.toBe(tasteSignature(new Map([['y', 1]])));
    expect(tasteSignature(new Map())).toBe('cold-start');
  });
  it('topTasteTags strips the archetype: prefix and orders by weight', () => {
    expect(topTasteTags(new Map([['archetype:dominant', 5], ['witty', 9]]), 2)).toEqual(['witty', 'dominant']);
  });
});

describe('rotation-logic', () => {
  const NOW = Date.parse('2026-09-20T00:00:00Z');
  const mk = (id: string, gender: string, likes: number, ageDays = 200): RotationCandidate => ({
    id, name: id, gender, archetype: null, tags: null, like_count: likes, follower_count: likes,
    created_at: new Date(NOW - ageDays * 86_400_000).toISOString(),
  });
  const pool = [
    mk('f1', 'female', 900), mk('f2', 'female', 800), mk('f3', 'female', 700), mk('f4', 'female', 600),
    mk('m1', 'male', 100),   mk('m2', 'male', 90),
    mk('a1', 'anime', 50),   mk('new1', 'female', 5, 1),
  ];

  it('scores engagement and gives brand-new characters a freshness lift', () => {
    expect(baseScore(mk('x', 'f', 0, 0), NOW)).toBeGreaterThan(baseScore(mk('y', 'f', 0, 400), NOW));
    expect(baseScore(mk('hi', 'f', 1000), NOW)).toBeGreaterThan(baseScore(mk('lo', 'f', 10), NOW));
  });

  it('deterministic picks fill the slots and cover every gender', () => {
    const picks = deterministicPicks(pool, 5, new Set(), NOW);
    expect(picks).toHaveLength(5);
    const genders = new Set(picks.map(id => pool.find(c => c.id === id)!.gender));
    expect(genders.has('female') && genders.has('male') && genders.has('anime')).toBe(true);
  });

  it('drops ids the LLM invented and de-duplicates, then tops up', () => {
    const picks = sanitizePicks(['f1', 'ghost', 'f1', 'm1'], pool, 5, new Set(), NOW);
    expect(picks).toHaveLength(5);
    expect(new Set(picks).size).toBe(5);
    expect(picks.every(id => pool.some(c => c.id === id))).toBe(true);
  });

  it('enforces the carry-over cap even if the LLM ignores it', () => {
    const previous = new Set(['f1', 'f2', 'f3', 'f4', 'm1']);
    const picks = sanitizePicks(['f1', 'f2', 'f3', 'f4', 'm1'], pool, 5, previous, NOW);
    const carried = picks.filter(id => previous.has(id)).length;
    expect(carried).toBeLessThanOrEqual(Math.floor(5 * MAX_CARRY_OVER_SHARE));
    expect(picks).toHaveLength(5);
  });

  it('guarantees gender coverage so gender-locked pages always find a hero', () => {
    const picks = sanitizePicks(['f1', 'f2', 'f3', 'f4', 'new1'], pool, 5, new Set(), NOW);
    const genders = new Set(picks.map(id => pool.find(c => c.id === id)!.gender));
    expect(genders.has('male')).toBe(true);
    expect(genders.has('anime')).toBe(true);
    expect(picks).toHaveLength(5);
  });

  it('never returns more than the slot count, and handles a pool smaller than the slots', () => {
    expect(sanitizePicks(['f1', 'f2', 'f3'], pool, 2, new Set(), NOW)).toHaveLength(2);
    const tiny = [mk('only', 'female', 1)];
    expect(sanitizePicks([], tiny, 5, new Set(), NOW)).toEqual(['only']);
  });
});
