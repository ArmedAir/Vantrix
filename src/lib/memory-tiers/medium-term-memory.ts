/**
 * Medium-Term Memory Engine — Vantrix Memory Tiers
 * ─────────────────────────────────────────────────────────────────────────
 * NEW, standalone tier — separate from `lib/ai/memory.ts` (flat fact
 * strings) and `lib/ai/user-fact-graph.ts` (typed facts). Namespace is
 * fully isolated (`vantrix:tier:mtm:*`); this module never reads or writes
 * either of those.
 *
 * What this tier is: a small set of session-level DIGESTS — "what this
 * stretch of conversation was actually about" — sitting between the raw
 * short-term buffer and permanent long-term memory. Where short-term-memory
 * is verbatim and long-term is curated-and-permanent, this tier is
 * generalized and provisional: entries can merge into each other as the
 * same topic recurs, and they expire (MTM_TTL) if nothing keeps
 * reinforcing them — a topic that came up once three weeks ago and never
 * again genuinely isn't "medium-term" anymore.
 *
 * Entries are produced by summarizeAndPromote(), which takes a batch of
 * ShortTermTurns (from short-term-memory.ts, passed in — this module does
 * no reading from that tier itself, keeping it independently testable) and
 * asks a small/cheap model for a digest. AI is not on any user-facing
 * critical path here — this only ever runs from the consolidation cron,
 * so latency and occasional failure are both fine; a heuristic fallback
 * keeps the tier populated even if the AI call fails outright.
 */

import { generateStructured } from '@/lib/ai/capability';
import { redis }              from '@/lib/redis';
import { logger }             from '@/lib/logger';
import type { ShortTermTurn } from './short-term-memory';

export interface MediumTermEntry {
  id: string;
  summary: string;
  /** Coarse topic tags, used only for merge-detection below — not a full
   *  taxonomy, just enough to notice "this is the same thread again". */
  topics: string[];
  /** 0-1. Higher = more likely to eventually promote to long-term. */
  importance: number;
  turnsCovered: number;
  firstTurnAt: number;
  lastTurnAt: number;
  createdAt: number;
  updatedAt: number;
  reinforcedCount: number;
  /** Set once addLongTermMemory() has been called for this entry, so the
   *  consolidation pass never promotes the same digest twice. */
  promotedToLongTerm: boolean;
}

const MTM_TTL           = 60 * 60 * 24 * 21; // 21 days, sliding
const MAX_ENTRIES        = 25;
const MIN_TURNS_TO_DIGEST = 4; // below this, not enough signal for a real digest
export const LTM_IMPORTANCE_THRESHOLD  = 0.75;
export const LTM_REINFORCEMENT_THRESHOLD = 3;

function mtmKey(userId: string, characterId: string): string {
  return `vantrix:tier:mtm:${userId}:${characterId}`;
}

function newId(): string {
  return `mtm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Load / save ─────────────────────────────────────────────────────────

export async function getMediumTermMemory(
  userId: string,
  characterId: string,
): Promise<MediumTermEntry[]> {
  try {
    const raw = await redis.get<string>(mtmKey(userId, characterId));
    if (!raw) return [];
    const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    return Array.isArray(parsed) ? (parsed as MediumTermEntry[]) : [];
  } catch (err) {
    logger.warn('[medium-term-memory] read failed, returning empty', { userId, characterId, error: String(err) });
    return [];
  }
}

async function saveMediumTermMemory(
  userId: string,
  characterId: string,
  entries: MediumTermEntry[],
): Promise<void> {
  await redis.set(mtmKey(userId, characterId), JSON.stringify(entries), { ex: MTM_TTL });
}

// ── AI digest (called only from the consolidation cron) ──────────────────

interface DigestResult {
  summary: string;
  topics: string[];
  importance: number; // 0-1
}

async function aiDigest(turns: ShortTermTurn[], characterName: string): Promise<DigestResult | null> {
  const transcript = turns
    .map(t => `${t.role === 'user' ? 'User' : characterName}: ${t.text}`)
    .join('\n')
    .slice(0, 3000);

  const parsed = await generateStructured<DigestResult>({
    caller: 'memory-tier-medium',
    maxTokens: 200,
    temperature: 0.2,
    system: `Summarize a stretch of conversation into ONE short digest, from ${characterName}'s point of view.
Output ONLY JSON: {"summary": string (<160 chars, generalized, not verbatim), "topics": string[] (1-4 short lowercase tags), "importance": number (0-1, how emotionally/relationally significant this stretch was)}.
Be conservative with importance — routine small talk is 0.1-0.3, a genuinely meaningful moment is 0.6+.`,
    user: transcript,
  });

  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.topics)) return null;

  return {
    summary: parsed.summary.slice(0, 200),
    topics: parsed.topics.slice(0, 4).map(t => String(t).toLowerCase().trim()).filter(Boolean),
    importance: Math.min(1, Math.max(0, Number(parsed.importance) || 0.3)),
  };
}

/** No-API fallback so a summarization failure never leaves the tier empty. */
function heuristicDigest(turns: ShortTermTurn[]): DigestResult {
  const userTurns = turns.filter(t => t.role === 'user');
  const mostSalient = [...userTurns].sort((a, b) => b.salience - a.salience)[0];
  const avgSalience = userTurns.length
    ? userTurns.reduce((s, t) => s + t.salience, 0) / userTurns.length
    : 0.2;

  return {
    summary: mostSalient ? `Talked about: ${mostSalient.text.slice(0, 140)}` : 'A brief exchange.',
    topics: ['general'],
    importance: Math.min(1, avgSalience),
  };
}

// ── Merge detection ────────────────────────────────────────────────────────

function sharedTopic(a: string[], b: string[]): boolean {
  return a.some(t => b.includes(t));
}

/**
 * Summarize a batch of short-term turns and merge the result into this
 * pair's medium-term entries — folding into an existing entry (bumping
 * importance/reinforcedCount, same rationale as memory-consolidation.ts's
 * repetition-strengthens-not-averages choice) if it shares a topic with
 * one already stored, otherwise appending a new entry.
 */
export async function summarizeAndPromote(
  userId: string,
  characterId: string,
  characterName: string,
  turns: ShortTermTurn[],
): Promise<MediumTermEntry | null> {
  if (turns.length < MIN_TURNS_TO_DIGEST) return null;

  const digest = (await aiDigest(turns, characterName).catch(err => {
    logger.warn('[medium-term-memory] aiDigest failed, using heuristic', { userId, characterId, error: String(err) });
    return null;
  })) ?? heuristicDigest(turns);

  const now = Date.now();
  const existing = await getMediumTermMemory(userId, characterId);
  const matchIdx = existing.findIndex(e => !e.promotedToLongTerm && sharedTopic(e.topics, digest.topics));

  let entry: MediumTermEntry;
  let next: MediumTermEntry[];

  if (matchIdx !== -1) {
    const prior = existing[matchIdx];
    entry = {
      ...prior,
      summary: digest.summary, // most recent digest wins for display text
      topics: Array.from(new Set([...prior.topics, ...digest.topics])).slice(0, 6),
      importance: Math.min(1, Math.max(prior.importance, digest.importance) + 0.1),
      turnsCovered: prior.turnsCovered + turns.length,
      lastTurnAt: turns[turns.length - 1].ts,
      updatedAt: now,
      reinforcedCount: prior.reinforcedCount + 1,
    };
    next = [...existing];
    next[matchIdx] = entry;
  } else {
    entry = {
      id: newId(),
      summary: digest.summary,
      topics: digest.topics,
      importance: digest.importance,
      turnsCovered: turns.length,
      firstTurnAt: turns[0].ts,
      lastTurnAt: turns[turns.length - 1].ts,
      createdAt: now,
      updatedAt: now,
      reinforcedCount: 1,
      promotedToLongTerm: false,
    };
    next = [...existing, entry];
  }

  // Cap at MAX_ENTRIES, dropping the least important/oldest first — but
  // never drop something already promoted, that's long-term's record to
  // manage now, not a reason to keep re-summarizing it here.
  next.sort((a, b) => (b.importance - a.importance) || (b.updatedAt - a.updatedAt));
  if (next.length > MAX_ENTRIES) {
    const kept = next.filter(e => e.promotedToLongTerm).concat(
      next.filter(e => !e.promotedToLongTerm).slice(0, MAX_ENTRIES - next.filter(e => e.promotedToLongTerm).length),
    );
    next = kept;
  }

  await saveMediumTermMemory(userId, characterId, next);
  return entry;
}

/** Mark entries as promoted so the consolidation pass doesn't repeat it. */
export async function markPromoted(
  userId: string,
  characterId: string,
  entryIds: string[],
): Promise<void> {
  if (!entryIds.length) return;
  const existing = await getMediumTermMemory(userId, characterId);
  const idSet = new Set(entryIds);
  const next = existing.map(e => (idSet.has(e.id) ? { ...e, promotedToLongTerm: true } : e));
  await saveMediumTermMemory(userId, characterId, next);
}

export function entriesEligibleForPromotion(entries: MediumTermEntry[]): MediumTermEntry[] {
  return entries.filter(
    e =>
      !e.promotedToLongTerm &&
      (e.importance >= LTM_IMPORTANCE_THRESHOLD || e.reinforcedCount >= LTM_REINFORCEMENT_THRESHOLD),
  );
}

export function formatMediumTermForPrompt(entries: MediumTermEntry[], limit = 6): string {
  const active = entries.filter(e => !e.promotedToLongTerm);
  if (!active.length) return '';
  const sorted = [...active].sort((a, b) => b.importance - a.importance).slice(0, limit);
  const lines = sorted.map(e => `- ${e.summary}`);
  return `What's been building recently:\n${lines.join('\n')}`;
}

export async function clearMediumTerm(userId: string, characterId: string): Promise<void> {
  await redis.del(mtmKey(userId, characterId));
}
