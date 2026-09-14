/**
 * Memory Tier Engine — Vantrix Memory Tiers (orchestrator)
 * ─────────────────────────────────────────────────────────────────────────
 * Public facade for the new short/medium/long-term system in this
 * directory. This is intentionally a NEW, independent subsystem —
 * see the header comments in short-term-memory.ts / medium-term-memory.ts /
 * long-term-memory.ts for exactly which existing modules each one avoids
 * touching. Nothing in this directory is imported by, or imports from,
 * memory.ts, user-fact-graph.ts, memory-graph.ts, or memory-arbiter.ts.
 *
 * Two entry points for callers:
 *
 *   recordTurn()             — call once per chat turn (fire-and-forget,
 *                               same pattern as updateMemory() in
 *                               lib/ai/memory.ts). Writes to short-term only;
 *                               cheap, synchronous-feeling, no AI call. Takes
 *                               an optional `tier` ('free' | 'premium', any
 *                               other/omitted value normalises to 'free')
 *                               that short-term-memory.ts uses to size the
 *                               buffer/TTL and enable salience-protected
 *                               retention — see that file's tiering note.
 *
 *   getTieredMemoryContext() — call when building the system prompt. Reads
 *                               all three tiers and returns one prompt
 *                               block plus the raw per-tier data.
 *
 * Promotion between tiers does NOT happen inline on the chat path — it
 * happens in runTierConsolidation(), driven by the
 * memory-tier-consolidation cron (src/app/api/cron/memory-tier-consolidation).
 * That keeps every user-facing chat turn's latency identical to before this
 * subsystem existed; consolidation is a batch job, same philosophy as
 * memory-consolidation.ts's "run periodically, not per-turn" rationale.
 *
 * Wiring this in: this module does not modify the existing prompt-building
 * call sites (e.g. companion-context.ts). To use it, add its promptBlock
 * alongside — not instead of — getCanonicalMemoryContext()'s output:
 *
 *   const [canonical, tiered] = await Promise.all([
 *     getCanonicalMemoryContext(userId, characterId),
 *     getTieredMemoryContext(userId, characterId),
 *   ]);
 *   const systemPrompt = base + canonical.promptBlock + tiered.promptBlock;
 */

import { logger } from '@/lib/logger';
import {
  appendShortTermTurn,
  getShortTermBuffer,
  formatShortTermForPrompt,
  popDirtyPairs,
  pairFromToken,
  type ShortTermRole,
  type ShortTermTurn,
} from './short-term-memory';
import {
  summarizeAndPromote,
  getMediumTermMemory,
  formatMediumTermForPrompt,
  entriesEligibleForPromotion,
  markPromoted,
  type MediumTermEntry,
} from './medium-term-memory';
import {
  addLongTermMemory,
  getLongTermMemories,
  formatLongTermForPrompt,
  type LongTermMemory,
} from './long-term-memory';

const MIN_NEW_TURNS_FOR_DIGEST = 6;

// Tracks, per pair, how many short-term turns had already been digested as
// of the last consolidation pass — so a re-run only summarizes what's new
// rather than re-digesting the whole buffer every time. In-process is fine
// here: worst case on a cold start is one extra (idempotent-ish, just
// slightly redundant) digest, not lost data — the buffer itself is durable
// in Redis regardless of this checkpoint.
const checkpoints = new Map<string, number>();

function checkpointKey(userId: string, characterId: string): string {
  return `${userId}::${characterId}`;
}

// ── recordTurn: the only thing called from the live chat path ────────────

export async function recordTurn(
  userId: string,
  characterId: string,
  role: ShortTermRole,
  text: string,
  tier?: string | null,
): Promise<void> {
  await appendShortTermTurn(userId, characterId, role, text, tier);
}

// ── Consolidation: called only from the cron ──────────────────────────────

export interface ConsolidationResult {
  userId: string;
  characterId: string;
  skipped: boolean;
  digested: boolean;
  promotedCount: number;
}

export async function runTierConsolidation(
  userId: string,
  characterId: string,
  characterName: string,
): Promise<ConsolidationResult> {
  const base = { userId, characterId };
  try {
    const turns = await getShortTermBuffer(userId, characterId);
    const ckey = checkpointKey(userId, characterId);
    const already = checkpoints.get(ckey) ?? 0;
    const newTurns = turns.slice(already);

    let digested = false;
    if (newTurns.length >= MIN_NEW_TURNS_FOR_DIGEST) {
      const result = await summarizeAndPromote(userId, characterId, characterName, newTurns);
      digested = result !== null;
      checkpoints.set(ckey, turns.length);
    } else if (turns.length === 0) {
      // Buffer fully expired since last check — reset so a fresh
      // conversation later doesn't think it's already been digested.
      checkpoints.delete(ckey);
    }

    // Promote any medium-term entries that have crossed the threshold,
    // regardless of whether this pass produced a fresh digest — a prior
    // digest might only now have accumulated enough reinforcement.
    const mtmEntries = await getMediumTermMemory(userId, characterId);
    const eligible = entriesEligibleForPromotion(mtmEntries);

    let promotedCount = 0;
    for (const entry of eligible) {
      const promoted = await addLongTermMemory(userId, characterId, {
        headline: entry.summary.slice(0, 160),
        content: entry.summary,
        importance01: entry.importance,
        originMediumTermId: entry.id,
      });
      if (promoted) promotedCount++;
    }
    if (eligible.length) {
      await markPromoted(userId, characterId, eligible.map(e => e.id));
    }

    return { ...base, skipped: false, digested, promotedCount };
  } catch (err) {
    logger.warn('[memory-tier-engine] consolidation failed', { ...base, error: String(err) });
    return { ...base, skipped: true, digested: false, promotedCount: 0 };
  }
}

/**
 * Drains up to `batchSize` dirty pairs and consolidates each. Intended to
 * be called from the cron route with characterName resolution supplied by
 * the caller (the cron batches a `characters` lookup — this module has no
 * Supabase dependency of its own beyond long-term-memory.ts's writes, and
 * deliberately doesn't add one just to look up a name).
 */
export async function drainDirtyPairs(
  batchSize: number,
  resolveCharacterName: (characterId: string) => Promise<string>,
): Promise<ConsolidationResult[]> {
  const tokens = await popDirtyPairs(batchSize);
  const results: ConsolidationResult[] = [];

  for (const token of tokens) {
    const pair = pairFromToken(token);
    if (!pair) continue;
    const characterName = await resolveCharacterName(pair.characterId).catch(() => 'They');
    results.push(await runTierConsolidation(pair.userId, pair.characterId, characterName));
  }

  return results;
}

// ── Read path: prompt-ready combined context ──────────────────────────────

export interface TieredMemoryContext {
  promptBlock: string;
  shortTerm: ShortTermTurn[];
  mediumTerm: MediumTermEntry[];
  longTerm: LongTermMemory[];
}

export async function getTieredMemoryContext(
  userId: string,
  characterId: string,
): Promise<TieredMemoryContext> {
  const [shortTerm, mediumTerm, longTerm] = await Promise.all([
    getShortTermBuffer(userId, characterId).catch(() => [] as ShortTermTurn[]),
    getMediumTermMemory(userId, characterId).catch(() => [] as MediumTermEntry[]),
    getLongTermMemories(userId, characterId).catch(() => [] as LongTermMemory[]),
  ]);

  const blocks = [
    formatLongTermForPrompt(longTerm),
    formatMediumTermForPrompt(mediumTerm),
    formatShortTermForPrompt(shortTerm),
  ].filter(Boolean);

  return {
    promptBlock: blocks.length ? `\n${blocks.join('\n\n')}` : '',
    shortTerm,
    mediumTerm,
    longTerm,
  };
}
