/**
 * Pure (no I/O, no env) helpers for ai-curator.ts — split out so the parts that
 * decide whether an LLM's answer is TRUSTED can be unit-tested without Redis,
 * Supabase or a Groq key.
 */

export interface CuratorCandidate {
  id:           string;
  name:         string;
  archetype:    string | null;
  tags:         string[] | null;
  opening_line: string | null;
}

export interface CuratedResult {
  /** Same IDs as the input, reordered. */
  orderedIds: string[];
  /** id → short display reason ("matches your taste for witty banter"); may be partial. */
  reasons: Map<string, string>;
  /** false when the deterministic order was returned unchanged. */
  wasCurated: boolean;
}

export interface CuratorLLMResponse {
  order: { id: string; reason?: string | undefined }[];
}

/**
 * What the model actually returns: short numeric aliases (1..N, the item's
 * position in the shortlist it was shown) instead of UUIDs. A UUID costs ~20
 * tokens and had to be sent AND echoed back for every candidate; on Groq's free
 * tier (200K tokens/day per model) that was most of the budget. Aliases are
 * translated back to real ids by fromAliasResponse() before anything downstream
 * (applyCuration, the cache) sees them, so those stay id-based and unchanged.
 */
export interface CuratorAliasResponse {
  order: { n: number; reason?: string | undefined }[];
}

/**
 * Translate an alias reply into the id-based shape applyCuration() expects.
 * STRICT on purpose: any alias that isn't an integer inside 1..shortlist.length
 * discards the whole reply (null → deterministic order). Duplicates and
 * omissions are then caught by applyCuration's exact-permutation gate, so the
 * "same set, no additions, omissions or duplicates" trust rule is unchanged.
 */
export function fromAliasResponse(
  shortlist: CuratorCandidate[],
  parsed: CuratorAliasResponse,
): CuratorLLMResponse | null {
  const order: CuratorLLMResponse['order'] = [];
  for (const entry of parsed.order) {
    if (!Number.isInteger(entry.n)) return null;
    const candidate = shortlist[entry.n - 1];
    if (!candidate) return null;
    order.push({ id: candidate.id, reason: entry.reason });
  }
  return { order };
}

/** FNV-1a, 32-bit — stable, fast, no deps. Good enough for cache-key bucketing. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Order-independent: reordering is exactly what we ask the LLM to do, so it must not invalidate its own cache entry. */
export function hashIds(ids: string[]): string {
  return fnv1a([...ids].sort().join('|'));
}

export function topTasteTags(tagWeights: Map<string, number>, limit: number): string[] {
  return [...tagWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag.replace(/^archetype:/, ''));
}

/**
 * Taste SEGMENT signature. The whole point of the segment design: at scale you
 * cannot afford one LLM call per user on a free tier, but users whose strongest
 * signals match don't need separate calls — the deterministic scorer already
 * personalises the shortlist per user; the LLM's job (diversity, top-slot pick,
 * a human-readable reason) is the same for everyone in the segment.
 * Sorted so "romantic, witty" and "witty, romantic" land in one segment.
 */
export function tasteSignature(tagWeights: Map<string, number>, depth = 5): string {
  const top = topTasteTags(tagWeights, depth);
  return top.length ? [...top].sort().join(',') : 'cold-start';
}

/**
 * Trust gate: accept the LLM's order only if it is an exact permutation of the
 * shortlist it was shown (same set, no additions, omissions or duplicates).
 * Anything else → null → caller keeps the deterministic order. Items beyond the
 * shortlist (never shown to the LLM) keep their original relative order after it.
 */
export function applyCuration(
  shortlist: CuratorCandidate[],
  fullDeterministicOrder: string[],
  parsed: CuratorLLMResponse,
): CuratedResult | null {
  const shortlistIds = new Set(shortlist.map(c => c.id));
  const proposedIds  = parsed.order.map(o => o.id);
  const proposedSet  = new Set(proposedIds);

  const valid =
    proposedIds.length === shortlistIds.size &&
    proposedSet.size === proposedIds.length &&
    [...shortlistIds].every(id => proposedSet.has(id));
  if (!valid) return null;

  const remainder = fullDeterministicOrder.filter(id => !shortlistIds.has(id));
  const reasons = new Map<string, string>();
  for (const entry of parsed.order) {
    const r = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (r) reasons.set(entry.id, r.slice(0, 60));
  }
  return { orderedIds: [...proposedIds, ...remainder], reasons, wasCurated: true };
}
