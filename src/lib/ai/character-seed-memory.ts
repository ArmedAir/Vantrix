/**
 * Character Seed Memories — creator-authored foundational memories.
 *
 * Distinct from memory_graph (runtime, per user-character pair, built from
 * an actual conversation) and priority_memories (also runtime/per-user).
 * These rows are authored once by the creator in Creator Studio's Memory
 * Builder (character_seed_memories table, full CRUD at
 * /api/characters/[id]/memories) and apply identically to every user's
 * first and every subsequent conversation with this character — the same
 * role backstory/personality play, just structured as discrete, weighted
 * facts instead of one prose blob.
 *
 * WIRE FIX: the migration's own docstring (20260803_character_seed_memories.sql)
 * says these are "read at chat-init time by the AI orchestrator, the same
 * way backstory/personality are" — but nothing ever called this. The Memory
 * Builder UI and its API route were fully functional; the read side of the
 * feature simply didn't exist. Any seed memory a creator wrote was captured
 * and stored, then never surfaced to the model.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger }        from '@/lib/logger';
import type { SecretTier } from '@/types/roleplay-system';

export interface CharacterSeedMemory {
  id:          string;
  category:    string;
  headline:    string;
  content:     string;
  importance:  number; // 0-100, per character_seed_memories.importance CHECK
  // WIRE FIX: previously not selected at all, which meant callers had no
  // way to know which seed memories were testable — see memory-test-engine.ts
  // header. is_testable defaults FALSE in the DB for older rows, so this is
  // safe to treat as always-present rather than optional.
  is_testable: boolean;
  test_hint:   string | null;
  // LEAK FIX (see 20261229_secret_tier_column_and_backfill.sql): only
  // populated for category='secret' rows. Lets filterAccessibleSeedMemories()
  // drop secrets the user hasn't earned yet, instead of relying on the model
  // to voluntarily honor the advisory text from formatSecretTierForPrompt()
  // while the locked content sits right above it in context.
  tier:        SecretTier | null;
}

/** Load a character's creator-authored seed memories, highest importance first. */
export async function getCharacterSeedMemories(
  characterId: string,
  limit = 8,
): Promise<CharacterSeedMemory[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('character_seed_memories')
      .select('id,category,headline,content,importance,is_testable,test_hint,tier')
      .eq('character_id', characterId)
      .order('position', { ascending: true })
      .order('importance', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn('[character-seed-memory] fetch failed', { characterId, error: error.message });
      return [];
    }
    return (data ?? []) as unknown as CharacterSeedMemory[];
  } catch (err) {
    logger.warn('[character-seed-memory] fetch failed', { characterId, error: String(err) });
    return [];
  }
}

/**
 * LEAK FIX: drop category='secret' rows whose tier the user hasn't unlocked
 * yet. Previously every fetched seed memory — including dark/catastrophic
 * secrets, which carry the highest importance weights in the table — was
 * injected into the prompt unconditionally, regardless of relationship
 * stage. formatSecretTierForPrompt() only ever added advisory text asking
 * the model not to reveal locked tiers; it never removed the locked content
 * itself from context. This is the actual gate.
 *
 * Non-secret categories (psychology, romance, speech, relationship_stages,
 * memory_system, rivals, ...) always pass through untouched — tier is only
 * meaningful for category='secret'.
 *
 * `availableTiers` undefined means "caller didn't compute tiers" (e.g. the
 * queue-worker fallback path in src/lib/queue/worker.ts, which doesn't call
 * computeAvailableTiers before assembleFullPrompt) — fails open to current
 * behavior rather than hiding all secrets for a caller that never asked for
 * gating, matching the same `?? [...]` fallback prompt.ts already uses for
 * the advisory-text section.
 */
export function filterAccessibleSeedMemories(
  memories: CharacterSeedMemory[],
  availableTiers?: SecretTier[],
): CharacterSeedMemory[] {
  if (!availableTiers) return memories;
  return memories.filter(m => {
    if (m.category !== 'secret') return true;
    if (!m.tier) return true; // unclassified secret row — fail open, don't silently drop content
    return availableTiers.includes(m.tier);
  });
}

const PROMPT_ITEM_MAX_CHARS = 200; // content can be up to 2000 chars in the DB (Memory Builder); keep injection compact

/** Format for prompt injection — foundational, true in every conversation. */
export function formatSeedMemoriesForPrompt(memories: CharacterSeedMemory[]): string {
  if (!memories.length) return '';
  const sorted = [...memories].sort((a, b) => b.importance - a.importance);
  const lines = sorted.map(m => {
    const content = m.content.length > PROMPT_ITEM_MAX_CHARS
      ? m.content.slice(0, PROMPT_ITEM_MAX_CHARS).trim() + '…'
      : m.content;
    return `- ${m.headline}: ${content}`;
  });
  return `\n── Foundational Memories (true in every conversation) ──\n${lines.join('\n')}`;
}
