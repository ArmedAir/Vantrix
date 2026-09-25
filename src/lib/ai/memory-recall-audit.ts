/**
 * Memory Recall Audit — the write side of the recall-accuracy loop.
 * ───────────────────────────────────────────────────────────────────────────
 * Every other module under lib/ai/memory-* answers "what did we retrieve and
 * in what order" (memory-graph.ts, semantic-memory.ts, memory-arbiter.ts) —
 * none of them answer "did the model actually use it correctly." This
 * module is the narrow piece that closes that gap: a fire-and-forget log of
 * (memory shown, reply given) pairs for memory-recall-grader.ts to sample
 * and grade later.
 *
 * Deliberately minimal at the write site:
 *   - No LLM call here. No grading here. Just a row.
 *   - Never awaited from the request path — call this exactly the same way
 *     addMemory()'s own fire-and-forget siblings (promoteMemoryNode,
 *     embedAndStoreMemory) are called: `.catch(bg('logMemoryRecallAudit'))`,
 *     after the reply has already been sent to the client.
 *   - Never throws. A failure here must never be visible to the chat
 *     request it's describing — that request is already long over by the
 *     time this runs (see the call site in chat/stream/route.ts, right
 *     alongside the existing assistant-message persistence).
 *
 * What gets logged is deliberately the EXACT slice the model saw, not the
 * wider candidate pool — memory_ids should equal
 * formatMemoryGraphForPrompt()'s own top-MEMORY_PROMPT_INJECTION_CAP cut of
 * whatever ordering (semantic, emotion-biased, or base recency/weight) the
 * caller ultimately used. Logging the fetched-but-not-shown candidates
 * would grade the retrieval layer a second time (already covered by
 * memory-graph-format-prompt-ordering.test.ts /
 * semantic-memory-retrieval.test.ts) instead of the actually-missing layer:
 * whether the reply is faithful to what was shown.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { MEMORY_PROMPT_INJECTION_CAP, type MemoryNode } from '@/lib/ai/memory-graph';

const MAX_LOGGED_TEXT_LEN = 2000; // generous for a judge prompt; bounds row size against a pathological reply

export interface MemoryRecallAuditInput {
  userId: string;
  characterId: string;
  conversationId: string | null;
  /**
   * The final ordered memory list this turn used for prompt injection
   * (semanticMemoryGraph in chat/stream/route.ts) — this function applies
   * the same MEMORY_PROMPT_INJECTION_CAP cut formatMemoryGraphForPrompt()
   * does, so callers should pass the full ordered list, not a pre-sliced
   * one, and the two stay guaranteed in sync by construction.
   */
  shownMemories: Pick<MemoryNode, 'id'>[];
  factConflictCount: number;
  userMessage: string;
  assistantReply: string;
}

function truncate(text: string): string {
  return text.length > MAX_LOGGED_TEXT_LEN ? text.slice(0, MAX_LOGGED_TEXT_LEN) : text;
}

/**
 * Fire-and-forget. Silently no-ops (logged as a warning, never thrown) if
 * shownMemories is empty — a turn where no memory was injected has nothing
 * for the grader to check, and every character's very first message will
 * always hit this path, so this is the expected common case, not an error.
 */
export async function logMemoryRecallAudit(input: MemoryRecallAuditInput): Promise<void> {
  const memoryIds = input.shownMemories.slice(0, MEMORY_PROMPT_INJECTION_CAP).map((m) => m.id);
  if (memoryIds.length === 0) return;

  try {
    const { error } = await supabaseAdmin.from('memory_recall_audit').insert({
      user_id:             input.userId,
      character_id:        input.characterId,
      conversation_id:     input.conversationId,
      memory_ids:           memoryIds,
      fact_conflict_count: Math.max(0, input.factConflictCount),
      user_message:        truncate(input.userMessage),
      assistant_reply:     truncate(input.assistantReply),
    });
    if (error) {
      logger.warn('memory-recall-audit: insert failed', { userId: input.userId, characterId: input.characterId, error: error.message });
    }
  } catch (err) {
    logger.warn('memory-recall-audit: insert failed', { userId: input.userId, characterId: input.characterId, error: String(err) });
  }
}
