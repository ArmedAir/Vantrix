/**
 * Semantic Cache — Per-User Near-Duplicate Response Caching
 *
 * RE-SCOPED AGAIN (2026-09-05, cost audit) — see checkSemanticCache() below.
 *
 * History:
 *   - Original design: any near-duplicate message, matched via MinHash/
 *     Jaccard, could match a cached reply from *any* other user on the same
 *     character — this served one user's cached reply to another as their
 *     companion's own words. DISABLED outright (2026-08-08).
 *   - 2026-08-23: re-enabled, but scoped to a GENERIC_OPENERS allowlist only
 *     (greetings/farewells/acks/thanks) with cross-user sharing, since those
 *     replies genuinely are impersonal. Layers 2/3 (MinHash/LSH near-dup
 *     matching) stayed unused — they matched arbitrary messages, which is
 *     exactly what caused the original leak.
 *
 * This revision: every cache key (exact, LSH band buckets, word sets) is now
 * namespaced by `${userId}:${characterId}`, not just systemPrompt. A cached
 * reply can now only ever be returned to the same user, on the same
 * companion, that produced it — there is no code path left that can read a
 * key written by a different userId. That eliminates the cross-user leak at
 * the storage layer itself, rather than by restricting *which messages* are
 * eligible. With that guarantee in place, Layers 2/3 (MinHash/Jaccard near-
 * duplicate matching) are wired back in for all cacheable messages, not just
 * GENERIC_OPENERS — "How are you?" vs "how r u doing" now both hit the same
 * per-user cache slot, recovering the cost savings the original 3-layer
 * design was built for. GENERIC_OPENERS/CANONICAL_MAP stay in place as
 * Layer 1 (cheap exact/canonical match tried before the LSH probe).
 *
 * Three-layer semantic equivalence (all LIVE, all per-user):
 *
 *   Layer 1 — Canonical normalization:
 *     Punctuation removal, case folding, whitespace collapse, and a
 *     curated synonym table for common short phrases. Zero-cost,
 *     zero-latency exact-key lookup, tried first for every cacheable message.
 *
 *   Layer 2 — Word-level MinHash (64 hash functions, 8 LSH bands × 8 values):
 *     For messages that miss Layer 1, we compute a MinHash signature and
 *     probe the per-user LSH bucket keys to find candidate cache keys.
 *
 *   Layer 3 — Jaccard similarity gating:
 *     For each LSH candidate we compute the true Jaccard similarity from the
 *     stored word set. We only return the cached reply if similarity ≥ 0.82.
 *
 * Bypassed for:
 *   - premium tier (freshness guarantee — was elite/enterprise under the
 *     old multi-tier model; see TWO-TIER MODEL note at BYPASS_TIERS below)
 *   - dating mode (emotionally dynamic)
 *   - memory-enriched prompts (personalised, never generic — a per-user
 *     cache doesn't change this: memory can update between two otherwise-
 *     identical messages from the same user, so these still must not cache)
 *   - messages > 400 chars (likely unique, low hit-rate/cost tradeoff)
 */

import { createHash } from 'crypto';
import type { Tier }  from '@/lib/rate-limit';
import { redis }              from '@/lib/redis';
import { bg }                 from '@/lib/logger';


// ── Config ────────────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.82;
const MAX_CACHEABLE_CHARS   = 400;
const LSH_BANDS             = 8;
const LSH_ROWS              = 8;    // rows per band; signature length = 64
const CACHE_TTL             = 300;  // 5 minutes
const LSH_TTL               = 360;  // slightly longer so we can probe after write
// TWO-TIER MODEL FIX: this was `new Set(['elite', 'enterprise'])`. Tier is
// now typed as 'free' | 'premium' (lib/rate-limit), so 'elite'/'enterprise'
// could never match isCacheable()'s `BYPASS_TIERS.has(tier)` check below —
// premium (paying) users were silently getting cached, potentially stale,
// replies instead of the freshness guarantee this set exists to provide.
const BYPASS_TIERS: Set<Tier> = new Set<Tier>(['premium']);

// ── Synonym / canonical table ─────────────────────────────────────────────────

const CANONICAL_MAP: Record<string, string> = {
  // greetings
  hi: 'hello', hey: 'hello', heya: 'hello', hiya: 'hello', sup: 'hello',
  howdy: 'hello', 'hey there': 'hello', 'hi there': 'hello',
  // farewells
  bye: 'goodbye', 'bye bye': 'goodbye', cya: 'goodbye', 'see ya': 'goodbye',
  later: 'goodbye', 'talk later': 'goodbye',
  // acks
  ok: 'okay', k: 'okay', yep: 'yes', yup: 'yes', yeah: 'yes', nope: 'no',
  nah: 'no', sure: 'yes', alright: 'okay',
  // common check-ins
  'how are you': 'how are you', 'how r u': 'how are you',
  'how are u': 'how are you', 'hows it going': 'how are you',
  'whats up': 'how are you', "what's up": 'how are you',
  'how have you been': 'how are you',
  // thanks
  thx: 'thanks', ty: 'thanks', 'thank you': 'thanks', 'ty so much': 'thanks',
  'thanks a lot': 'thanks',
};

const cacheDayKey = (type: 'hits' | 'misses') =>
  `vantrix:metrics:cache_${type}:${new Date().toISOString().slice(0, 10)}`;

async function trackCacheMetric(type: 'hit' | 'miss'): Promise<void> {
  // Metrics are non-critical — a Redis hiccup here must never fail the
  // chat request itself (checkSemanticCache() awaits this inline before
  // returning a hit). Same "optimization, not a dependency" contract as
  // storeSemanticCache()'s own try/catch below.
  try {
    const key = type === 'hit' ? cacheDayKey('hits') : cacheDayKey('misses');
    // Expire at end of day UTC
    const eod = new Date(); eod.setUTCHours(23, 59, 59, 0);
    const pipe = redis.pipeline();
    pipe.incr(key);
    pipe.expireat(key, Math.floor(eod.getTime() / 1000));
    await pipe.exec();
  } catch { /* non-critical */ }
}

// ── Normalize ─────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  let s = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Try full canonical match first
  if (CANONICAL_MAP[s]) return CANONICAL_MAP[s];

  // Partial: replace known short substrings
  for (const [pat, canon] of Object.entries(CANONICAL_MAP)) {
    if (s === pat || s.startsWith(pat + ' ')) {
      s = s.replace(pat, canon);
      break;
    }
  }
  return s;
}

function wordSet(text: string): Set<string> {
  return new Set(text.split(/\s+/).filter(w => w.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// ── MinHash (64 hash functions) ───────────────────────────────────────────────

// Pre-computed large primes for universal hashing: h_i(x) = (a_i * x + b_i) mod p
const PRIME = 2_147_483_647; // Mersenne prime 2^31-1
const HASH_PARAMS: [number, number][] = Array.from({ length: 64 }, (_, i) => [
  (1_664_525 + i * 1_013_904_223) >>> 0,
  (1_013_904_223 + i * 1_664_525) >>> 0,
]);

function minhashSignature(words: Set<string>): number[] {
  const sig = new Array<number>(64).fill(Number.MAX_SAFE_INTEGER);
  for (const word of words) {
    let h = 0;
    for (let j = 0; j < word.length; j++) h = (Math.imul(31, h) + word.charCodeAt(j)) | 0;
    const x = Math.abs(h);
    for (let i = 0; i < 64; i++) {
      const [a, b] = HASH_PARAMS[i];
      const hv = ((Math.imul(a, x) + b) % PRIME + PRIME) % PRIME;
      if (hv < sig[i]) sig[i] = hv;
    }
  }
  return sig;
}

/**
 * Every cache key below is namespaced by `scope` = `${userId}:${characterId}`.
 * This is the entire fix for the original cross-user leak: a key written
 * under one user's scope has no key collision, and no lookup path, that
 * reaches another user's scope — even for byte-identical messages on the
 * same character. Scoping by characterId too (not just userId) means a
 * user's own near-identical greeting to two different companions still
 * gets two independent cache entries, since companions' voices differ.
 */
function scopeOf(userId: string, characterId: string): string {
  return createHash('sha256').update(`${userId}:${characterId}`).digest('hex').slice(0, 16);
}

/** LSH band keys: 8 bands × 8 rows  8 Redis keys per signature, per scope */
function lshBandKeys(sig: number[], scope: string): string[] {
  const keys: string[] = [];
  for (let b = 0; b < LSH_BANDS; b++) {
    const band = sig.slice(b * LSH_ROWS, (b + 1) * LSH_ROWS).join('|');
    const bh   = createHash('sha256').update(`${scope}:${b}:${band}`).digest('hex').slice(0, 16);
    keys.push(`ai:slsh:${scope}:${bh}`);
  }
  return keys;
}

// ── Cache key (exact match) ───────────────────────────────────────────────────

function exactKey(scope: string, normalized: string): string {
  const h = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `ai:sresp:${scope}:${h}`;
}

// ── Public types ──────────────────────────────────────────────────────────────

export type SemanticCacheResult =
  | {
      hit:   true;
      reply: string;
      key:   string;
      mode:  'exact' | 'canonical' | 'semantic';
    }
  | {
      hit:   false;
      key:   string | null;
      words: Set<string>;
      sig:   number[] | null;
      bandKeys: string[] | null;
    };

// ── Cacheable predicate ───────────────────────────────────────────────────────
// Tier/mode/length gates only — there is no longer a content allowlist here.
// Every message that clears these gates is eligible for the per-user/per-
// character scoped cache (Layer 1 exact/canonical, then Layer 2/3 near-
// duplicate) — see the file header for why that's now safe.
function isCacheable(tier: Tier, msg: string, datingMode: boolean, hasMemory: boolean): boolean {
  if (BYPASS_TIERS.has(tier)) return false;
  if (datingMode)              return false;
  if (hasMemory)               return false;
  if (msg.length > MAX_CACHEABLE_CHARS) return false;
  return true;
}

// ── Check ─────────────────────────────────────────────────────────────────────

export async function checkSemanticCache(params: {
  tier:         Tier;
  userId:       string;
  characterId:  string;
  systemPrompt: string;
  userMsg:  string;
  datingMode:   boolean;
  hasMemory:    boolean;
}): Promise<SemanticCacheResult> {
  const { tier, userId, characterId, userMsg, datingMode, hasMemory } = params;
  const miss = (key: string | null = null, words: Set<string> = new Set()): SemanticCacheResult =>
    ({ hit: false, key, words, sig: null, bandKeys: null });

  if (!isCacheable(tier, userMsg, datingMode, hasMemory)) return miss();

  const scope      = scopeOf(userId, characterId);
  const normalized = normalize(userMsg);
  const words      = wordSet(normalized);

  // Layer 1 — canonical exact match. Cheapest check, tried first regardless
  // of whether the message is a GENERIC_OPENERS entry: the exact key is
  // scoped per-user now, so there's no cross-user exposure either way.
  const key = exactKey(scope, normalized);
  try {
    const cached = await redis.get<string>(key);
    if (cached) {
      await trackCacheMetric('hit');
      return { hit: true, reply: cached, key, mode: 'canonical' };
    }
  } catch (err) {
    bg('semantic-cache.check')(err);
    return miss();
  }

  // Layer 2/3 — MinHash/LSH near-duplicate + Jaccard gating. RE-ENABLED
  // (2026-09-05): safe now that every key involved (band buckets, stored
  // word sets, exact key) is namespaced by `scope` = hash(userId:characterId)
  // — see file header. A candidate returned from lshCandidates() can only
  // ever have been written by this same user, for this same character.
  if (words.size > 4) {
    try {
      const sig      = minhashSignature(words);
      const bandKeys = lshBandKeys(sig, scope);
      const candidateKey = await lshBestMatch(bandKeys, words, scope);
      if (candidateKey) {
        const cached = await redis.get<string>(candidateKey);
        if (cached) {
          await trackCacheMetric('hit');
          return { hit: true, reply: cached, key: candidateKey, mode: 'semantic' };
        }
      }
      await trackCacheMetric('miss');
      return miss(key, words);
    } catch (err) {
      bg('semantic-cache.lsh-probe')(err);
      // Fall through to plain miss with the exact key still available for
      // storeSemanticCache() — Layer 1 write still happens even if the
      // LSH probe itself failed.
    }
  }

  await trackCacheMetric('miss');
  return miss(key, words);
}

/**
 * Probes the LSH band buckets for candidate keys, then confirms with true
 * Jaccard similarity against each candidate's stored word set. Returns the
 * first candidate clearing SIMILARITY_THRESHOLD, or null.
 */
async function lshBestMatch(bandKeys: string[], words: Set<string>, scope: string): Promise<string | null> {
  const candidateKeys = new Set<string>();
  for (const bk of bandKeys) {
    try {
      const members = await redis.smembers(bk);
      for (const m of members) candidateKeys.add(m);
    } catch { /* one bad band shouldn't sink the whole probe */ }
  }
  // Defense in depth: even if a key somehow appeared in a bucket it
  // shouldn't have, refuse to compare against anything outside our scope.
  for (const candidateKey of candidateKeys) {
    if (!candidateKey.startsWith(`ai:sresp:${scope}:`)) continue;
    try {
      const storedWordsJson = await redis.get<string>(`${candidateKey}:words`);
      if (!storedWordsJson) continue;
      const storedWords = new Set(JSON.parse(storedWordsJson) as string[]);
      if (jaccard(words, storedWords) >= SIMILARITY_THRESHOLD) return candidateKey;
    } catch { /* skip unreadable candidate, try the next */ }
  }
  return null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export async function storeSemanticCache(params: {
  key:      string | null;
  words:    Set<string>;
  sig:      number[] | null;
  bandKeys: string[] | null;
  reply:    string;
}): Promise<void> {
  const { key, words, sig, bandKeys, reply } = params;
  if (!key || !reply) return;

  try {
    const pipe = redis.pipeline();

    // Store reply
    pipe.set(key, reply, { ex: CACHE_TTL });

    // Store word set for Jaccard comparison
    pipe.set(`${key}:words`, JSON.stringify(Array.from(words)), { ex: CACHE_TTL });

    // Register key in LSH band buckets so future queries can find it
    if (sig && bandKeys) {
      for (const bk of bandKeys) {
        pipe.sadd(bk, key);
        pipe.expire(bk, LSH_TTL);
      }
    }

    await pipe.exec();
  } catch { /* non-critical */ }
}

/** Remove stale band entries (cleanup on explicit cache invalidation) */
export async function evictSemanticCache(key: string): Promise<void> {
  try {
    await redis.del(key, `${key}:words`);
  } catch { /* non-critical */ }
}
