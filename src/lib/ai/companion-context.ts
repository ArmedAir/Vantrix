/**
 * CompanionContext — the canonical, single-object representation of
 * everything needed to generate a companion response.
 *
 * WHY THIS EXISTS: src/app/api/chat/stream/route.ts assembles ~30 engine
 * outputs (psychology, relationship, memory graph, memory facts, emotion,
 * agency, rupture/repair, beliefs, reputation, theory of mind, goals,
 * threads, journal, milestones, universe context, ...) as flat local
 * variables, fetched unconditionally on every message via one giant
 * Promise.all, then hand-fed into assembleFullPrompt() as ~30 separate
 * arguments. That means:
 *   - there is no single object anyone can log, test, or reason about as
 *     "the companion's current state for this turn"
 *   - there is no declared precedence when two engines' outputs could
 *     conflict (e.g. rupture state vs. relationship stage vs. mood)
 *   - there is no cognitive-budget gate — a "lol" message pays for the
 *     same 26-wide parallel load as a deep emotional message
 *
 * This module does NOT change route.ts's behavior. It defines the target
 * shape and an assembly function that performs the *same* underlying
 * engine calls route.ts already makes (types derived from the real
 * engines via ReturnType/Awaited, not hand-redeclared, so this can't
 * silently drift from what the engines actually return) — so route.ts can
 * be migrated to call into this incrementally and be verified at each
 * step, rather than rewritten in one pass.
 *
 * PRECEDENCE (declared here since nothing enforced it before): when
 * assembling a prompt, information should be treated as authoritative in
 * this order, highest first. Callers building a prompt from a
 * CompanionContext should resolve conflicts in this order, not in
 * whatever order fields happen to appear below.
 *
 *   1. canonical character definition       (character)
 *   2. active safety/moderation constraints (safety)      — can override anything below
 *   3. persistent relationship state        (relationship)
 *   4. validated long-term memory           (memory)
 *   5. current psychological/emotional state (state)
 *   6. live cognition scratchpad            (cognition)    — see note below
 *   7. recent conversation context          (conversation)
 *   8. world/universe context               (world)
 *   9. temporary/inferred signals           (inferred)      — lowest priority, easiest to override
 *
 * COMPANION-STATE CONSOLIDATION: this file's own header has said since it
 * was written that it is "the canonical, single-object representation" —
 * but until now it only actually covered relationship/memory/state/
 * conversation/world. Meanwhile unified-mind.ts (lib/mind/) computes a
 * genuinely separate "fortune arc" self-model and says explicitly in its
 * own header that it is "a composition layer... not authoritative state,"
 * and four more stores — companion-awareness.ts, working-memory.ts,
 * belief-store.ts (via belief-engine.ts's getActiveBeliefs, already
 * fetched above as `beliefs`), habit-store.ts, wisdom-store.ts — were each
 * independently readable with no single object holding all of them
 * together for one turn. That meant seven+ files could each be
 * independently queried at a call site, each with its own fetch, its own
 * failure mode, and no shared snapshot to log/test/diff as "the
 * companion's state right now."
 *
 * The new `cognition` section below closes that gap by pulling all of
 * them into this already-declared-canonical object: working memory,
 * beliefs, habits, wisdom, companion-to-companion social awareness, and
 * the unified-mind fortune arc. None of those five modules' own storage or
 * write paths change — this is purely an additional read composed here,
 * exactly like `memory` and `state` already compose their own sources.
 * unified-mind.ts's own docstring already scoped it correctly ("this does
 * not replace the individual engines... this is a composition layer on
 * top") — it's simply now composed one level higher, into the one object
 * this file always intended to be authoritative.
 */

import { getPsychology } from '@/lib/ai/attachment-engine';
import { ensureRelationship } from '@/lib/ai/relationship-engine';
import { getMemoryGraph, getDiscoveredLore } from '@/lib/ai/memory-graph';
import { getMemory } from '@/lib/ai/memory';
import { getDynamicInterests, detectTopicsFromMessage } from '@/lib/ai/personality-evolution';
import { getFactGraph } from '@/lib/ai/user-fact-graph';
import { getLiveGraph } from '@/lib/ai/knowledge-graph';
import { getRelationshipTier, getMemoryRetentionPolicy, getActiveFineTune, formatFineTuneForPrompt,
         type RelationshipTier, type MemoryRetentionPolicy, type CharacterFineTune } from '@/lib/commerce/raas';
import { getSessionBridge } from '@/lib/ai/session-bridge';
import { getEmotionState } from '@/lib/ai/emotion-state';
import { getRevolutionProfile } from '@/lib/ai/character-revolution';
import { assembleUniverseContext } from '@/lib/universe/universe-prompt';
import { getPriorityMemories } from '@/lib/ai/priority-memory';
import { getActiveGoals, getRecentIntents } from '@/lib/ai/goal-engine';
import { getOpenThreads, getLongTermPlan } from '@/lib/ai/agency-engine';
import { getRecentJournalEntries } from '@/lib/ai/daily-journal';
import { getUnsurfacedThoughts } from '@/lib/ai/independent-thoughts';
import { recomputeMilestones, getMilestones } from '@/lib/ai/relationship-milestones';
import { retrieveRelevantKnowledge } from '@/lib/ai/knowledge-library';
import { getCoreDesire, getFulfillment } from '@/lib/ai/desire-engine';
import { getCharacterSeedMemories } from '@/lib/ai/character-seed-memory';
import { getEvolutionTraits } from '@/lib/ai/bidirectional-evolution';
import { getActiveBeliefs } from '@/lib/cognition/belief-engine';
import { getWorkingMemory } from '@/lib/cognition/working-memory';
import { getCompanionRelationships } from '@/lib/ai/companion-awareness';
import { getUnifiedMind } from '@/lib/mind/unified-mind';
import { arbitrateMemoryContext } from '@/lib/ai/memory-arbiter';
import { getTieredMemoryContext } from '@/lib/memory-tiers/memory-tier-engine';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { DEFAULT_PSYCHOLOGY } from '@/lib/ai/attachment-engine';
import { buildAttachmentProfile, RELATIONSHIP_GOALS, type CharacterRevolutionProfile } from '@/lib/ai/character-revolution';
import { NEUTRAL_EMOTION } from '@/lib/ai/emotion-engine';
import type { RelationshipState } from '@/lib/ai/relationship-engine';

/**
 * FAIL-OPEN WRAPPER (RESILIENCE-1, 2026-09-02): see CHAT_AUDIT_2026-08-22.md's
 * "Not covered in this pass" follow-up — "does every engine call have a
 * fail-open path ... one unguarded throw deep in that chain would 500 the
 * whole stream." It didn't. Only 3 of the ~26 entries in the Promise.all
 * below (getActiveBeliefs, getCompanionRelationships, getUnifiedMind) were
 * individually caught. Every other entry — getPsychology, ensureRelationship,
 * getMemoryGraph, getSessionBridge, assembleUniverseContext, etc. — was a
 * bare promise inside one shared Promise.all: a single transient DB/Redis
 * hiccup in ANY of them rejected the whole array, assembleCompanionContext()
 * threw, and since route.ts calls it with a bare `await` (no try/catch,
 * confirmed at its one call site), that exception would 500 the entire chat
 * stream for a completely unrelated reason — the "breaks mid-conversation"
 * failure mode. This wraps every entry so one engine's outage degrades only
 * that slice of context (a companion who's momentarily forgotten today's
 * mood, not a companion who's gone silent).
 */
function safe<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((err) => {
    logger.warn('companion-context: engine failed, using fallback', { engine: label, error: String(err) });
    return fallback;
  });
}

/**
 * SANCTUARY-MODE (see 20270111_sanctuary_mode_toggle.sql): reads
 * conversations.sanctuary_mode, a per-conversation opt-out of the living
 * world. When on, this skips assembleUniverseContext() entirely below
 * rather than fetching and discarding it — assembleUniverseContext fans
 * out to ~30 sub-engines (location, social graph, events, stories, life/
 * job/reputation/economy/weather/culture/...), so a sanctuary
 * conversation should pay for none of that, not just have the result
 * dropped from the prompt.
 *
 * conversationId is null on a brand-new chat's first turn, before any
 * conversation row exists — resolves to "off" (world context included),
 * the same default every other conversation-scoped read in this file
 * falls back to, since there's nothing to be in sanctuary mode about yet.
 */
async function isSanctuaryMode(conversationId: string | null): Promise<boolean> {
  if (!conversationId) return false;
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('sanctuary_mode')
    .eq('id', conversationId)
    .maybeSingle();
  return data?.sanctuary_mode === true;
}

/** Fallback shape for a brand-new relationship, matching what ensureRelationship()
 *  itself inserts for a first-time pair (see relationship-engine.ts). Used only
 *  if ensureRelationship's own DB read *and* insert both throw — the DB is
 *  actually unreachable, not just "no row yet" (that case already resolves
 *  normally inside ensureRelationship). */
const FALLBACK_RELATIONSHIP: RelationshipState = {
  stage: 'stranger', stage_xp: 0, stage_xp_cap: 50, total_xp: 0,
  health: 50, jealousy_level: 0, milestones: 0, last_checkin: null,
};

/** Fallback shape for character-revolution.ts's profile — a neutral secure-attachment
 *  starting point, same catalogue data getRevolutionProfile() itself would seed a
 *  new profile with, used only if both its read and its own initialize-on-miss
 *  path throw. */
function fallbackRevolutionProfile(userId: string, characterId: string): CharacterRevolutionProfile {
  return {
    userId, characterId,
    attachment: buildAttachmentProfile('secure'),
    fears: [], ambitions: [], emotionalNeeds: [], beliefs: [],
    relationshipGoals: RELATIONSHIP_GOALS,
    memoryArchive: [], activeGoal: null, lastBeliefShift: null,
  };
}

/**
 * How much intelligence this turn needs. Not yet wired into route.ts —
 * defined here so classification and gating can be developed and tested
 * against real message samples before anything depends on it. See §20 of
 * the product brief this addresses ("cognitive budget").
 */
export type TurnComplexity = 'low' | 'normal' | 'high';

/**
 * Cheap, synchronous, zero-latency heuristic — deliberately simple so it
 * can run before any I/O. False negatives (treating something complex as
 * low) are the safe failure direction here: `assembleCompanionContext`
 * below does not yet use this to skip any engine calls, so misclassifying
 * something as `low` costs nothing today. It exists to be validated
 * against real traffic before it gates anything.
 */
export function classifyTurnComplexity(message: string): TurnComplexity {
  const trimmed = message.trim();
  // High-signal check runs FIRST and unconditionally — a short message
  // ("scared", "lonely") must never be short-circuited to `low` by the
  // length check below just because it's brief. Real crisis-adjacent
  // detection lives in lib/safety/crisis-detection.ts and gates the
  // request entirely before this ever runs; this is a much cheaper,
  // separate signal only used (once wired) to decide how much companion
  // context to load — erring toward `high` here is always the safe
  // direction, since it only means "load more," never "load less safety."
  const highSignal = /\b(remember|scared|afraid|hurt|love you|hate|dying|die|hurt myself|lonely|alone|miss you|trauma|abuse)\b/i;
  if (highSignal.test(trimmed) || trimmed.length > 280) return 'high';
  if (trimmed.length <= 12 && !/[?]/.test(trimmed)) return 'low';
  return 'normal';
}

export interface CompanionContext {
  meta: {
    userId: string;
    characterId: string;
    conversationId: string | null;
    message: string;
    complexity: TurnComplexity;
  };

  /** Precedence 1 — canonical character definition. Populated by the caller
   *  (route.ts already fetches the character row separately, since it also
   *  needs it for gating decisions before this context is assembled). */
  character: unknown;

  /** Precedence 3 — persistent relationship state. */
  relationship: {
    psychology: Awaited<ReturnType<typeof getPsychology>>;
    relationship: Awaited<ReturnType<typeof ensureRelationship>>;
    revolutionProfile: Awaited<ReturnType<typeof getRevolutionProfile>>;
    evolutionTraits: Awaited<ReturnType<typeof getEvolutionTraits>>;
  };

  /** Precedence 4 — validated long-term memory. */
  memory: {
    graph: Awaited<ReturnType<typeof getMemoryGraph>>;
    facts: Awaited<ReturnType<typeof getMemory>>;
    priority: Awaited<ReturnType<typeof getPriorityMemories>>;
    seed: Awaited<ReturnType<typeof getCharacterSeedMemories>>;
    factGraph: Awaited<ReturnType<typeof getFactGraph>>;
    // Deterministic entity-relation triplets — see knowledge-graph.ts.
    // Sits alongside factGraph (fuzzy, category/key/value) as the exact,
    // versioned counterpart: point-lookups instead of similarity search.
    knowledgeGraph: Awaited<ReturnType<typeof getLiveGraph>>;
    dynamicInterests: Awaited<ReturnType<typeof getDynamicInterests>>;
    discoveredLore: Awaited<ReturnType<typeof getDiscoveredLore>>;
    relevantKnowledge: Awaited<ReturnType<typeof retrieveRelevantKnowledge>>;
  };

  /** Precedence 5 — current psychological/emotional state. */
  state: {
    emotion: Awaited<ReturnType<typeof getEmotionState>>;
    coreDesire: Awaited<ReturnType<typeof getCoreDesire>>;
    fulfillment: Awaited<ReturnType<typeof getFulfillment>> | null;
    milestones: Awaited<ReturnType<typeof getMilestones>>;
  };

  /**
   * Precedence 6 — live cognition scratchpad. This is the consolidation
   * point for the previously-scattered companion-state modules (see
   * "COMPANION-STATE CONSOLIDATION" above). `fortune` is unified-mind.ts's
   * composed self-model (kept as its own sub-object rather than flattened,
   * since it's itself a composition of several world-state engines and
   * callers may reasonably want it as one unit); everything else is a
   * direct read of its respective store/engine, unmodified.
   */
  cognition: {
    workingMemory: ReturnType<typeof getWorkingMemory>;
    beliefs: Awaited<ReturnType<typeof getActiveBeliefs>>;
    companionRelationships: Awaited<ReturnType<typeof getCompanionRelationships>>;
    /** Null only if unified-mind's own composition failed outright — see catch below. */
    fortune: Awaited<ReturnType<typeof getUnifiedMind>> | null;
    /**
     * Arbitrated view of memory.facts + memory.factGraph (both still
     * present above, unmodified, for callers mid-migration) — see
     * memory-arbiter.ts. Use THIS, not memory.facts/memory.factGraph
     * directly, when injecting "what you know about this user" into a
     * prompt: it resolves same-topic contradictions between the two
     * sources by a declared precedence instead of injecting both.
     */
    canonicalMemory: ReturnType<typeof arbitrateMemoryContext>;
    /**
     * memory-tiers/memory-tier-engine.ts — new, independent short/medium/
     * long-term memory subsystem (Redis 2h/21d sliding tiers + a permanent
     * Postgres tier), populated by its own consolidation cron rather than
     * inline here. Deliberately not merged into canonicalMemory above: no
     * shared keys/tables/read-write path with memory.ts, user-fact-graph.ts,
     * or memory-graph.ts by design (see that module's README). Callers
     * building a prompt should inject `.promptBlock` alongside, not instead
     * of, canonicalMemory's.
     */
    tieredMemory: Awaited<ReturnType<typeof getTieredMemoryContext>>;
  };

  /** Precedence 7 — recent conversation context. */
  conversation: {
    sessionBridge: Awaited<ReturnType<typeof getSessionBridge>>;
    recentIntents: Awaited<ReturnType<typeof getRecentIntents>>;
    openThreads: Awaited<ReturnType<typeof getOpenThreads>>;
    longTermPlan: Awaited<ReturnType<typeof getLongTermPlan>>;
    journalEntries: Awaited<ReturnType<typeof getRecentJournalEntries>>;
    unsurfacedThoughts: Awaited<ReturnType<typeof getUnsurfacedThoughts>>;
    activeGoals: Awaited<ReturnType<typeof getActiveGoals>>;
  };

  /** Precedence 8 — world/universe context. */
  world: {
    universeContext: Awaited<ReturnType<typeof assembleUniverseContext>>;
  };

  /** RaaS — this relationship's purchased tier, retention policy, and any
   *  active creator fine-tune. See lib/commerce/raas.ts. */
  commerce: {
    relationshipTier: RelationshipTier;
    retentionPolicy: MemoryRetentionPolicy;
    activeFineTune: CharacterFineTune | null;
  };

  /** Precedence 2 — safety/moderation constraints. Deliberately left for
   *  the caller to populate: crisis detection, tier/NSFW gating, and
   *  moderation all run as hard *gates* before generation even starts
   *  (route.ts is correct to keep those as early returns, not context
   *  fields) — this slot exists so anything that must survive into the
   *  prompt itself (e.g. "avoid topic X this turn") has a declared home
   *  instead of being smuggled into an unrelated field. */
  safety: Record<string, unknown>;
}

export interface AssembleCompanionContextInput {
  userId: string;
  characterId: string;
  conversationId: string | null;
  message: string;
  character: unknown;
}

/**
 * Assembles a CompanionContext by running the same engine calls route.ts's
 * "mega-parallel context load" already performs. Currently always fetches
 * everything (matching route.ts's existing behavior exactly, so swapping
 * this in is behavior-preserving) — the complexity classification above is
 * computed and attached but does not yet skip anything. That's a
 * deliberate, separately-reviewable next step once this shape has been
 * proven against real route.ts output, not bundled into this change.
 */
export async function assembleCompanionContext(
  input: AssembleCompanionContextInput,
): Promise<CompanionContext> {
  const { userId, characterId, conversationId, message, character } = input;
  const complexity = classifyTurnComplexity(message);

  const [
    psychology, relationship, memoryGraph, memoryFacts,
    dynamicInterests, factGraph, knowledgeGraph, sessionBridge, discoveredLore,
    emotion, revolutionProfile, universeContext, priorityMemories,
    activeGoals, recentIntents, openThreads, longTermPlan,
    journalEntries, unsurfacedThoughts, milestones, relevantKnowledge,
    coreDesire, seedMemories, evolutionTraits,
    beliefs, companionRelationships, fortune, tieredMemory,
  ] = await Promise.all([
    safe('getPsychology', getPsychology(userId, characterId), DEFAULT_PSYCHOLOGY),
    safe('ensureRelationship', ensureRelationship(userId, characterId), FALLBACK_RELATIONSHIP),
    // FEATURE-7 (Invisible Memory): fetch a wider candidate pool from the DB
    // (emotion/recency ranked) so semanticRerankMemories() downstream has
    // real material to promote a genuinely relevant-but-lower-emotion memory
    // into the top slice that formatMemoryGraphForPrompt() actually shows.
    // At 12, the DB step alone decided the visible set and semantic
    // relevance could only reorder within it — "1. relevant memories" from
    // the spec never got a real chance to win over "3. emotionally
    // meaningful". 30 is still a single cheap indexed (user_id,
    // character_id) query; formatMemoryGraphForPrompt still caps what's
    // shown to the model at 8.
    safe('getMemoryGraph', getMemoryGraph(userId, characterId, 30), []),
    safe('getMemory', getMemory(userId, characterId), []),
    safe('getDynamicInterests', getDynamicInterests(userId, characterId), []),
    safe('getFactGraph', getFactGraph(userId, characterId), []),
    safe('getLiveGraph', getLiveGraph(userId, characterId), []),
    safe('getSessionBridge', getSessionBridge(userId, characterId), null),
    safe('getDiscoveredLore', getDiscoveredLore(userId, characterId), []),
    safe('getEmotionState', getEmotionState(userId, characterId), NEUTRAL_EMOTION),
    safe('getRevolutionProfile', getRevolutionProfile(userId, characterId, 0), fallbackRevolutionProfile(userId, characterId)),
    // SANCTUARY-MODE: isSanctuaryMode() resolved first, inside the same
    // Promise.all entry, so this whole chain still degrades through the
    // one safe() fallback ('') that already existed here if anything in
    // it fails — a sanctuary lookup failure fails toward "no world
    // context", the same direction assembleUniverseContext's own errors
    // already failed in before this change.
    safe(
      'assembleUniverseContext',
      isSanctuaryMode(conversationId).then((sanctuary) =>
        sanctuary ? '' : assembleUniverseContext(characterId, { userId }),
      ),
      '',
    ),
    safe('getPriorityMemories', getPriorityMemories(userId, characterId, { limit: 12 }), []),
    safe('getActiveGoals', getActiveGoals(characterId, userId), []),
    safe('getRecentIntents', getRecentIntents(userId, characterId, 5), []),
    safe('getOpenThreads', getOpenThreads(userId, characterId), []),
    safe('getLongTermPlan', getLongTermPlan(userId, characterId), null),
    safe('getRecentJournalEntries', getRecentJournalEntries(userId, characterId, 3), []),
    safe('getUnsurfacedThoughts', getUnsurfacedThoughts(userId, characterId, 3), []),
    safe('getMilestones', getMilestones(userId, characterId), null),
    safe('retrieveRelevantKnowledge', retrieveRelevantKnowledge(characterId, { userMessage: message, recentTopics: detectTopicsFromMessage(message) }), []),
    safe('getCoreDesire', getCoreDesire(characterId), null),
    safe('getCharacterSeedMemories', getCharacterSeedMemories(characterId, 8), []),
    safe('getEvolutionTraits', getEvolutionTraits(userId, characterId), []),
    // COMPANION-STATE CONSOLIDATION — see file header. Each of these is
    // independently guarded via safe(), same tolerance model now applied
    // uniformly across this whole Promise.all (see RESILIENCE-1 above):
    // one store being unavailable degrades that slice, never the whole
    // context assembly.
    //
    // COMPUTE-BUDGET FIX: getAllHabits/getAllWisdom were fetched here and
    // never consumed by any caller (verified repo-wide — route.ts never
    // reads cognition.habits/cognition.wisdom, and assembleCompanionContext
    // has exactly one real caller). Removed rather than left as dead I/O
    // that ran on every single turn for nothing. habit-engine.ts and
    // wisdom-engine.ts still call getAllHabits/getAllWisdom directly for
    // their own logic — this only removes this file's own unused copy.
    safe('getActiveBeliefs', getActiveBeliefs(userId, characterId), []),
    safe('getCompanionRelationships', getCompanionRelationships(characterId), []),
    safe('getUnifiedMind', getUnifiedMind(userId, characterId), null),
    // MEMORY-TIERS: new, independent subsystem — see field doc above.
    // getTieredMemoryContext() is already internally fail-open (each of
    // its 3 tier reads is individually caught), so this safe() wrapper is
    // belt-and-suspenders consistency with the rest of this Promise.all,
    // not a load-bearing guard.
    safe('getTieredMemoryContext', getTieredMemoryContext(userId, characterId),
      { promptBlock: '', shortTerm: [], mediumTerm: [], longTerm: [] }),
  ]);

  // Arbitrated view of memory.ts + user-fact-graph.ts + seed memories —
  // computed synchronously here (not fetched again) since memoryFacts,
  // factGraph, and seedMemories above are already the same three sources
  // getCanonicalMemoryContext() would otherwise re-fetch from Redis/
  // Supabase a second time on every single turn. Never throws — pure
  // in-memory arbitration over data that already fetched fail-open.
  //
  // RaaS: gate the hybrid memory stack by this relationship's purchased
  // tier (see lib/commerce/raas.ts) before it reaches arbitration or the
  // returned context — every relationship defaults to 'spark', and the
  // lookup itself fails open to that same default.
  const relationshipTier = await getRelationshipTier(userId, characterId).catch(() => 'spark' as const);
  const retentionPolicy = getMemoryRetentionPolicy(relationshipTier);

  const gatedKnowledgeGraph = retentionPolicy.includeKnowledgeGraph ? knowledgeGraph : [];
  const gatedPriorityMemories = retentionPolicy.includePriorityMemories ? priorityMemories : [];
  const gatedMemoryGraph = retentionPolicy.includeFullEpisodicLog
    ? memoryGraph.slice(0, retentionPolicy.episodicCap)
    : memoryGraph
        .filter(m => (Date.now() - new Date(m.event_time).getTime()) / 86_400_000 <= retentionPolicy.episodicWindowDays)
        .slice(0, retentionPolicy.episodicCap);

  const activeFineTune = retentionPolicy.fineTuneEligible
    ? await getActiveFineTune(characterId, relationshipTier).catch(() => null)
    : null;

  const canonicalMemory = arbitrateMemoryContext(memoryFacts, factGraph, seedMemories, { userId, characterId }, gatedKnowledgeGraph);
  if (activeFineTune) {
    const fineTuneBlock = formatFineTuneForPrompt(activeFineTune);
    canonicalMemory.factsPromptBlock = `${canonicalMemory.factsPromptBlock}\n${fineTuneBlock}`;
    canonicalMemory.promptBlock = `${canonicalMemory.promptBlock}\n${fineTuneBlock}`;
  }

  // fulfillment and recomputeMilestones both have independent failure
  // handling already established at the route.ts call sites — preserved
  // here rather than left to a bare await, so this function's failure
  // behavior matches route.ts's exactly.
  const fulfillment = await getFulfillment(characterId, userId).catch(() => null);
  void recomputeMilestones; // re-exported for callers that need the mutation, not read here

  logger.debug('companion-context: assembled', { userId, characterId, complexity });

  return {
    meta: { userId, characterId, conversationId, message, complexity },
    character,
    relationship: { psychology, relationship, revolutionProfile, evolutionTraits },
    memory: {
      graph: gatedMemoryGraph, facts: memoryFacts, priority: gatedPriorityMemories,
      seed: seedMemories, factGraph, knowledgeGraph: gatedKnowledgeGraph, dynamicInterests, discoveredLore, relevantKnowledge,
    },
    state: { emotion, coreDesire, fulfillment, milestones },
    cognition: {
      workingMemory: getWorkingMemory(userId, characterId),
      beliefs, companionRelationships, fortune, canonicalMemory, tieredMemory,
    },
    conversation: {
      sessionBridge, recentIntents, openThreads, longTermPlan,
      journalEntries, unsurfacedThoughts, activeGoals,
    },
    world: { universeContext },
    // RaaS: this relationship's purchased tier + active fine-tune, if any.
    // Not itself a prompt block (that's already folded into canonicalMemory
    // above) — exposed here for callers that need the raw tier (e.g. a
    // "you've unlocked Bond" UI banner) without re-fetching it.
    commerce: { relationshipTier, retentionPolicy, activeFineTune },
    safety: {},
  };
}
