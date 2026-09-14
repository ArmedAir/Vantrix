/**
 * Long-Term Memory Engine — Vantrix Memory Tiers
 * ─────────────────────────────────────────────────────────────────────────
 * NEW, standalone tier — separate table (`memory_tier_long_term`, see
 * supabase/migrations/20270108_memory_tier_long_term.sql), separate from
 * `memory_graph` (event-shaped moments) and `priority_memories` (export
 * cache derived from memory.ts/user-fact-graph.ts). Nothing here reads or
 * writes those tables.
 *
 * What this tier is: the permanent record. Entries only arrive here one
 * way — promoted from medium-term-memory.ts when a digest crosses the
 * importance or reinforcement threshold (see entriesEligibleForPromotion())
 * — never written directly from a chat turn. That's deliberate: long-term
 * memory should be the exception, not the default, or it fills up with
 * noise. No TTL: rows live until explicitly deleted (GDPR export/erasure
 * hooks below).
 *
 * Dedup on write: if a new promotion's headline closely matches an
 * existing row for the same pair, this reinforces that row instead of
 * inserting a near-duplicate — a topic that keeps coming back and gets
 * re-promoted every few weeks should look like one strengthening memory,
 * not a growing pile of near-identical ones.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger }        from '@/lib/logger';

export const LTM_WEIGHT_MIN = 1;
export const LTM_WEIGHT_MAX = 10;

export interface LongTermMemory {
  id: string;
  user_id: string;
  character_id: string;
  headline: string;
  content: string;
  importance: number; // 1-10
  source: 'promoted' | 'manual';
  origin_medium_term_id: string | null;
  reinforcement_count: number;
  created_at: string;
  last_reinforced_at: string;
}

function toDbWeight(importance01: number): number {
  // medium-term-memory.ts's importance is 0-1; this tier's DB column is
  // 1-10 (same convention as memory_graph's emotional_weight — see
  // MEMORY_WEIGHT_MIN/MAX in lib/ai/memory-graph.ts — kept consistent on
  // purpose so anyone reading both tiers doesn't have to hold two
  // different scales in their head).
  return Math.min(LTM_WEIGHT_MAX, Math.max(LTM_WEIGHT_MIN, Math.round(importance01 * 10)));
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

/** Crude but dependency-free near-duplicate check: shared-word overlap
 *  ratio against the shorter headline. Good enough at this tier's expected
 *  scale (tens, not thousands, of rows per pair) — no need to pull in the
 *  embedding pipeline memory-embeddings.ts already owns for memory_graph;
 *  keeping this tier's dedup independent is the point. */
function isNearDuplicate(a: string, b: string): boolean {
  const wordsA = new Set(normalizeForMatch(a).split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalizeForMatch(b).split(/\s+/).filter(Boolean));
  if (!wordsA.size || !wordsB.size) return false;
  const shorter = Math.min(wordsA.size, wordsB.size);
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / shorter >= 0.6;
}

// ── Write ──────────────────────────────────────────────────────────────────

export async function addLongTermMemory(
  userId: string,
  characterId: string,
  entry: {
    headline: string;
    content: string;
    importance01: number; // 0-1, from medium-term-memory.ts
    originMediumTermId?: string;
  },
): Promise<LongTermMemory | null> {
  try {
    const existing = await getLongTermMemories(userId, characterId, 100);
    const dupe = existing.find(e => isNearDuplicate(e.headline, entry.headline));

    if (dupe) {
      return reinforceLongTermMemory(dupe.id);
    }

    const { data, error } = await supabaseAdmin
      .from('memory_tier_long_term')
      .insert({
        user_id: userId,
        character_id: characterId,
        headline: entry.headline.slice(0, 160),
        content: entry.content.slice(0, 500),
        importance: toDbWeight(entry.importance01),
        source: 'promoted',
        origin_medium_term_id: entry.originMediumTermId ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    logger.info('[long-term-memory] promoted new entry', { userId, characterId, headline: entry.headline });
    return data as unknown as LongTermMemory;
  } catch (err) {
    logger.warn('[long-term-memory] addLongTermMemory failed', { userId, characterId, error: String(err) });
    return null;
  }
}

export async function reinforceLongTermMemory(id: string): Promise<LongTermMemory | null> {
  try {
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('memory_tier_long_term')
      .select('reinforcement_count')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const { data, error } = await supabaseAdmin
      .from('memory_tier_long_term')
      .update({
        reinforcement_count: ((current?.reinforcement_count as number) ?? 0) + 1,
        last_reinforced_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as unknown as LongTermMemory;
  } catch (err) {
    logger.warn('[long-term-memory] reinforceLongTermMemory failed', { id, error: String(err) });
    return null;
  }
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getLongTermMemories(
  userId: string,
  characterId: string,
  limit = 15,
): Promise<LongTermMemory[]> {
  const { data, error } = await supabaseAdmin
    .from('memory_tier_long_term')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .order('importance', { ascending: false })
    .order('reinforcement_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('[long-term-memory] getLongTermMemories failed', { userId, characterId, error: error.message });
    return [];
  }
  return (data ?? []) as unknown as LongTermMemory[];
}

export function formatLongTermForPrompt(memories: LongTermMemory[], limit = 10): string {
  if (!memories.length) return '';
  const sorted = [...memories].sort((a, b) => b.importance - a.importance).slice(0, limit);
  const lines = sorted.map(m => `- ${m.headline}`);
  return `What you'll always remember about them:\n${lines.join('\n')}`;
}

// ── Erasure (GDPR / user-facing reset) ─────────────────────────────────────

export async function clearLongTerm(userId: string, characterId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('memory_tier_long_term')
    .delete()
    .eq('user_id', userId)
    .eq('character_id', characterId);
  if (error) logger.warn('[long-term-memory] clearLongTerm failed', { userId, characterId, error: error.message });
}

export async function deleteAllForUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('memory_tier_long_term').delete().eq('user_id', userId);
  if (error) logger.warn('[long-term-memory] deleteAllForUser failed', { userId, error: error.message });
}
