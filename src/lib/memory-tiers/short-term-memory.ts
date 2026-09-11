/**
 * Short-Term Memory Engine — Vantrix Memory Tiers
 * ─────────────────────────────────────────────────────────────────────────
 * This is a NEW, standalone tier — deliberately separate from
 * `lib/cognition/working-memory.ts` (in-process, per-turn cognitive
 * scratchpad for drives/attention) and `lib/ai/memory.ts` (Redis fact
 * store). Namespace is fully isolated (`vantrix:tier:stm:*`) so nothing
 * here reads or writes any existing memory module's keys or tables.
 *
 * What this tier is: the raw, verbatim record of "this conversation, right
 * now" — a short, Redis-backed rolling buffer of the last N turns for a
 * (userId, characterId) pair. It is intentionally dumb: no extraction, no
 * scoring beyond a cheap heuristic, no AI calls. Its only job is to hold
 * enough recent raw context that:
 *   1. It can be shown in the prompt as immediate continuity, and
 *   2. medium-term-memory.ts has something to summarize from.
 *
 * Redis-backed (not in-process like working-memory.ts) on purpose: this
 * buffer needs to survive across serverless invocations of the same chat
 * session, not just within one warm instance.
 *
 * TTL is short and refreshed on every write — if a user goes quiet for a
 * while, "short-term" should genuinely lapse, the same way it would for a
 * person. That decay is exactly what promotes the worthwhile parts of it
 * into medium-term memory before it expires (see memory-tier-engine.ts's
 * consolidation pass).
 *
 * ── Free vs. Premium ───────────────────────────────────────────────────
 * PRODUCT DECISION (this revision): short-term memory is now plan-aware.
 * Free behaves exactly as before this change (2h TTL, 30-turn window, pure
 * recency eviction) — this is a strict superset, not a regression for
 * anyone. Premium gets three things, all realized in this file alone:
 *
 *   1. A longer, bigger window (6h / 60 turns instead of 2h / 30) and a
 *      higher per-turn capture length (1,600 chars instead of 800) — a
 *      premium companion simply holds onto "right now" for longer and
 *      loses less of it to truncation.
 *   2. Salience-aware retention. Free tier's eviction is dumb recency —
 *      the oldest turn always drops first, full stop. Premium reserves a
 *      handful of "protected" slots (see applyRetentionPolicy()) for the
 *      highest-salience turns that would otherwise age out, so a genuine
 *      disclosure ("I lost my job today") doesn't quietly vanish just
 *      because forty small-talk turns followed it.
 *   3. Richer per-turn signal. analyzeTurn() now tags *why* a turn scored
 *      the way it did (question / emotional / disclosure / commitment /
 *      correction), not just a bare float — still zero AI calls, same
 *      "cheap heuristic" philosophy as before, just a wider net.
 *
 * Tier is passed in by the caller (chat/stream/route.ts, lib/queue/worker.ts
 * — both already resolve it once per request for unrelated gating) rather
 * than looked up here. Same reasoning as lib/ai/token-budget.ts: this is a
 * hot, fire-and-forget path called on every single turn, so it should never
 * add its own DB round-trip just to find out who it's talking to. For the
 * same reason this module deliberately does NOT import the `Tier` type (or
 * anything else) from lib/rate-limit — its isolation from the rest of the
 * memory/entitlement surface is a design invariant (see the file-level
 * "NEW, standalone tier" note above), not an oversight, so it re-derives
 * its own two-value normalisation exactly like token-budget.ts does.
 */

import { redis }    from '@/lib/redis';
import { logger }   from '@/lib/logger';
import { sanitize } from '@/lib/sanitize';

export type ShortTermRole = 'user' | 'character';
export type ShortTermTier = 'free' | 'premium';

/**
 * Lightweight, regex-derived signal tags from analyzeTurn(). Not an NLP
 * pipeline — just enough texture that medium-term-memory.ts's digest and
 * the retention policy below can tell turns apart at a glance instead of
 * only having a bare float to go on.
 */
export type TurnFlag = 'question' | 'emotional' | 'disclosure' | 'commitment' | 'correction';

export interface ShortTermTurn {
  role: ShortTermRole;
  text: string;
  ts: number;
  /** Cheap 0-1 salience heuristic — see analyzeTurn(). Not an AI score;
   *  medium-term-memory.ts uses this only to bias which turns it feeds to
   *  its own (AI-backed) summarization, not as a memory-worthiness gate. */
  salience: number;
  /** Why this turn scored the way it did. Empty array is normal — most
   *  turns are just small talk. */
  flags: TurnFlag[];
  /** True only when this turn survived a trim specifically because of its
   *  salience rather than its recency — see applyRetentionPolicy(). Always
   *  false on free tier, which has no protected slots and therefore never
   *  pins anything. */
  pinned: boolean;
}

export interface ShortTermBuffer {
  userId: string;
  characterId: string;
  turns: ShortTermTurn[];
}

interface TierConfig {
  /** Sliding TTL, refreshed on every write — how long "this conversation"
   *  survives a lull before it genuinely lapses. */
  ttlSeconds: number;
  /** Hard cap on buffer length. */
  maxTurns: number;
  /** Per-turn truncation ceiling, enforced via sanitize(). */
  maxTextLen: number;
  /** How many of maxTurns are reserved for salience-protected turns that
   *  would otherwise be evicted by pure recency. 0 = free tier's original,
   *  unmodified recency-only behavior. */
  protectedSlots: number;
}

const TIER_CONFIG: Record<ShortTermTier, TierConfig> = {
  free: {
    ttlSeconds: 60 * 60 * 2, // 2 hours — "this conversation" window
    maxTurns: 30,            // ~15 exchanges
    maxTextLen: 800,
    protectedSlots: 0,
  },
  premium: {
    ttlSeconds: 60 * 60 * 6, // 6 hours — a premium companion's "right now" lasts longer
    maxTurns: 60,            // ~30 exchanges
    maxTextLen: 1600,        // longer messages captured without truncation
    protectedSlots: 8,       // up to 8 high-salience turns shielded from recency eviction
  },
};

// Mirrors normaliseTier() in lib/ai/token-budget.ts and normaliseTierForGate()
// in lib/auth/plan.ts — kept as its own local copy rather than a shared
// import for the isolation reasons in the file header. Any non-'free'
// string, including legacy DB tier ids still awaiting backfill, is treated
// as premium; an admin's effective tier is already resolved to 'premium'
// by the caller before it ever reaches here (see resolveEffectiveTier() in
// lib/rate-limit), so there's nothing admin-specific to special-case.
function normaliseTier(tier?: string | null): ShortTermTier {
  return tier && tier.toLowerCase() !== 'free' ? 'premium' : 'free';
}

function tierConfig(tier?: string | null): TierConfig {
  return TIER_CONFIG[normaliseTier(tier)];
}

/** Read-only lookup of a tier's limits — exposed for callers/UI copy that
 *  want to say something like "6 hours of memory" without hardcoding it
 *  a second time. Not used internally beyond tierConfig() above. */
export function getShortTermTierConfig(tier?: string | null): Readonly<TierConfig> {
  return tierConfig(tier);
}

// Dirty-set of pairs with STM content the consolidation cron hasn't looked
// at yet. A Redis SET, not a keyspace scan — memory-tier-engine.ts pops
// from this rather than ever calling redis.keys('vantrix:tier:stm:*'),
// which would get expensive as the user base grows.
const DIRTY_SET_KEY = 'vantrix:tier:dirty-pairs';

function stmKey(userId: string, characterId: string): string {
  return `vantrix:tier:stm:${userId}:${characterId}`;
}

function pairToken(userId: string, characterId: string): string {
  return `${userId}::${characterId}`;
}

export function pairFromToken(token: string): { userId: string; characterId: string } | null {
  const idx = token.indexOf('::');
  if (idx === -1) return null;
  return { userId: token.slice(0, idx), characterId: token.slice(idx + 2) };
}

// ── Cheap salience heuristic (no API call) ────────────────────────────────
// Deliberately crude — this only needs to roughly rank turns within one
// short buffer, not produce a calibrated score. Longer, more emotionally
// charged, question-bearing, self-disclosing, commitment-bearing, or
// self-correcting turns get a bump. Every pattern here also doubles as a
// TurnFlag so callers get the "why", not just the number.
const EMOTION_WORDS =
  /\b(love|hate|scared|afraid|excited|sad|happy|angry|hurt|miss|proud|worried|anxious|grateful|hope|lonely|heartbroken|nervous|relieved|jealous|overwhelmed)\b/i;
const DISCLOSURE_WORDS =
  /\b(i am|i'm|my name|i work|i live|i grew up|i've always|honestly|truth is|never told|secret)\b/i;
const COMMITMENT_WORDS =
  /\b(i'll|i will|i promise|let's|next time|from now on|i'm going to|i plan to)\b/i;
const CORRECTION_WORDS =
  /\b(actually|i mean|never ?mind|to clarify|what i meant|scratch that|on second thought)\b/i;

function analyzeTurn(text: string): { salience: number; flags: TurnFlag[] } {
  const flags: TurnFlag[] = [];
  let score = 0.2;

  if (text.length > 120) score += 0.15;
  if (text.length > 280) score += 0.1;
  if (text.includes('?')) {
    score += 0.15;
    flags.push('question');
  }
  if (EMOTION_WORDS.test(text)) {
    score += 0.25;
    flags.push('emotional');
  }
  if (DISCLOSURE_WORDS.test(text)) {
    score += 0.15;
    flags.push('disclosure');
  }
  if (COMMITMENT_WORDS.test(text)) {
    score += 0.15;
    flags.push('commitment');
  }
  if (CORRECTION_WORDS.test(text)) {
    score += 0.1;
    flags.push('correction');
  }

  return { salience: Math.min(1, score), flags };
}

/** Back-compat / standalone entry point — same heuristic as analyzeTurn(),
 *  just the bare number for callers that only need the score. */
export function scoreSalience(text: string): number {
  return analyzeTurn(text).salience;
}

// ── Retention policy ───────────────────────────────────────────────────────

/**
 * Free tier (protectedSlots === 0): identical to the original behavior —
 * a plain slice of the most recent maxTurns. Nothing pinned, nothing
 * protected, oldest always drops first.
 *
 * Premium tier: recency + protection. The most recent
 * (maxTurns - protectedSlots) turns are always kept verbatim (the "just
 * now" window). Of whatever falls outside that window and would otherwise
 * be evicted, the `protectedSlots` highest-salience turns are kept too —
 * pinned — so an important disclosure doesn't vanish purely because the
 * conversation kept going. Ties broken in favor of the more recent turn.
 *
 * A turn's `pinned` flag is recomputed from scratch on every call (never
 * carried forward as "permanently earned") — so something that was the
 * most salient turn an hour ago can still lose its slot to something more
 * salient now. In practice this makes protected turns naturally sticky
 * (each trim only pits the existing protected set against a single new
 * contender aging out of the recency window) without ever hard-locking a
 * slot forever.
 */
function applyRetentionPolicy(turns: ShortTermTurn[], cfg: TierConfig): ShortTermTurn[] {
  const reset = turns.map(t => (t.pinned ? { ...t, pinned: false } : t));

  if (cfg.protectedSlots === 0 || reset.length <= cfg.maxTurns) {
    return reset.slice(-cfg.maxTurns);
  }

  const recentFloor = Math.max(cfg.maxTurns - cfg.protectedSlots, 1);
  const recentWindow = reset.slice(-recentFloor);
  const olderPool = reset.slice(0, reset.length - recentFloor);

  const pinned = [...olderPool]
    .sort((a, b) => b.salience - a.salience || b.ts - a.ts)
    .slice(0, cfg.protectedSlots)
    .map(t => ({ ...t, pinned: true }));

  // Put the pinned survivors back in chronological order so the prompt
  // reads as a timeline, not a salience-ranked jumble.
  pinned.sort((a, b) => a.ts - b.ts);

  return [...pinned, ...recentWindow];
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Load the current short-term buffer (empty if none/expired). */
export async function getShortTermBuffer(
  userId: string,
  characterId: string,
): Promise<ShortTermTurn[]> {
  try {
    const raw = await redis.get<string>(stmKey(userId, characterId));
    if (!raw) return [];
    const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    if (!Array.isArray(parsed)) return [];

    // Defensive defaults for buffers written before flags/pinned existed —
    // TTL here is short (2-6h), so this is a brief transition window after
    // deploy, not a permanent migration burden.
    return (parsed as Partial<ShortTermTurn>[]).map(t => ({
      role: t.role === 'character' ? 'character' : 'user',
      text: typeof t.text === 'string' ? t.text : '',
      ts: typeof t.ts === 'number' ? t.ts : Date.now(),
      salience: typeof t.salience === 'number' ? t.salience : 0,
      flags: Array.isArray(t.flags) ? t.flags : [],
      pinned: t.pinned === true,
    }));
  } catch (err) {
    logger.warn('[short-term-memory] read failed, returning empty', { userId, characterId, error: String(err) });
    return [];
  }
}

/**
 * Append one turn to the buffer, refresh its TTL, and mark the pair dirty
 * for the consolidation cron. Fire-and-forget from the chat route — never
 * throws.
 *
 * `tier` controls window size, TTL, truncation length, and whether
 * salience-protected retention applies — see the tiering note in the file
 * header. Defaults to 'free' so any caller that hasn't been updated to
 * pass a tier keeps today's exact behavior.
 */
export async function appendShortTermTurn(
  userId: string,
  characterId: string,
  role: ShortTermRole,
  text: string,
  tier?: string | null,
): Promise<void> {
  try {
    const cfg = tierConfig(tier);
    const clean = sanitize(text, cfg.maxTextLen);
    if (!clean) return;

    const key = stmKey(userId, characterId);
    const existing = await getShortTermBuffer(userId, characterId);
    const { salience, flags } = analyzeTurn(clean);

    const turn: ShortTermTurn = {
      role,
      text: clean,
      ts: Date.now(),
      salience,
      flags,
      pinned: false,
    };

    const merged = applyRetentionPolicy([...existing, turn], cfg);

    await Promise.all([
      redis.set(key, JSON.stringify(merged), { ex: cfg.ttlSeconds }),
      redis.sadd(DIRTY_SET_KEY, pairToken(userId, characterId)),
    ]);
  } catch (err) {
    logger.warn('[short-term-memory] write failed', { userId, characterId, error: String(err) });
  }
}

/**
 * Prompt-ready rendering of the raw recent conversation. `limit` bounds
 * the "just now" window only — any pinned turns (premium-tier only; always
 * empty on free) are shown in full and separately, since there are at most
 * a handful of them (protectedSlots) and they're specifically the turns
 * worth not letting scroll off unnoticed.
 */
export function formatShortTermForPrompt(turns: ShortTermTurn[], limit = 12): string {
  if (!turns.length) return '';

  const pinned = turns.filter(t => t.pinned);
  const recent = turns.filter(t => !t.pinned).slice(-limit);
  const renderLine = (t: ShortTermTurn) => `${t.role === 'user' ? 'User' : 'You'}: ${t.text}`;

  if (!pinned.length) {
    return `This conversation so far:\n${recent.map(renderLine).join('\n')}`;
  }

  return [
    `Worth remembering from earlier in this conversation:\n${pinned.map(renderLine).join('\n')}`,
    `This conversation more recently:\n${recent.map(renderLine).join('\n')}`,
  ].join('\n\n');
}

/** Clear a pair's short-term buffer (user-facing "forget this session"). */
export async function clearShortTerm(userId: string, characterId: string): Promise<void> {
  await Promise.all([
    redis.del(stmKey(userId, characterId)),
    redis.srem(DIRTY_SET_KEY, pairToken(userId, characterId)),
  ]);
}

/**
 * Pop up to `count` dirty pair tokens for the consolidation cron to
 * process. Uses srem after read (not spop) so a pair that fails partway
 * through consolidation and needs a retry can be re-added by the caller,
 * whereas spop would already have destructively removed it.
 */
export async function popDirtyPairs(count: number): Promise<string[]> {
  try {
    const members = await redis.smembers(DIRTY_SET_KEY);
    const batch = (members as string[]).slice(0, count);
    if (batch.length) await redis.srem(DIRTY_SET_KEY, ...batch);
    return batch;
  } catch (err) {
    logger.warn('[short-term-memory] popDirtyPairs failed', { error: String(err) });
    return [];
  }
}

export function markPairDirty(userId: string, characterId: string): Promise<unknown> {
  return redis.sadd(DIRTY_SET_KEY, pairToken(userId, characterId));
}

/**
 * GDPR erasure hook: DIRTY_SET_KEY is a single global set shared across
 * every user, so scanAndDelete's per-user key-pattern sweep (see
 * api/user/delete/route.ts) can't reach it — a deleted user's tokens would
 * otherwise sit in that set until popDirtyPairs() eventually drains them
 * and pairFromToken() silently no-ops on the now-nonexistent buffer. Membership
 * in this set is small (bounded by active-conversation volume, drained
 * every 5 min by the cron) so a full smembers scan here is cheap — nowhere
 * near the scale that made scanAndDelete's cursor-based approach necessary
 * for the keyspace-wide patterns above.
 */
export async function removeUserDirtyPairs(userId: string): Promise<number> {
  try {
    const members = (await redis.smembers(DIRTY_SET_KEY)) as string[];
    const prefix = `${userId}::`;
    const stale = members.filter(m => m.startsWith(prefix));
    if (stale.length) await redis.srem(DIRTY_SET_KEY, ...stale);
    return stale.length;
  } catch (err) {
    logger.warn('[short-term-memory] removeUserDirtyPairs failed', { userId, error: String(err) });
    return 0;
  }
}
