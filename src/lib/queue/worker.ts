/**
 * Queue Worker — Performance-hardened v2
 *
 * Changes in this revision:
 *
 *   W1: Parallel context loading
 *     Character + conversation history + full context (psychology, memory,
 *     lore, etc.) now load in a single Promise.all() instead of two sequential
 *     steps. Saves one DB round-trip (~5-15ms) per job.
 *
 *   W2: Session bridge + voice fingerprint + fact graph
 *     Workers now inject all three enrichment layers (same parity as the sync
 *     chat route). Previously these were missing from queued requests.
 *
 *   W3: Post-job enrichment fire-and-forget
 *     Psychology update, XP, streak, memory update, and fact extraction
 *     now run fire-and-forget after orchestrator.finish(), matching the sync
 *     route. Previously the worker did none of this.
 *
 *   W4: Billing DLQ fallback
 *     orchestrator.finish() failure now enqueues to billing DLQ instead of
 *     silently losing tokens.
 *
 *   W5: ENGINE-PARITY FIX (structural, not another one-off port)
 *     Every prior parity fix in this file (W2, W3, and the several
 *     "PARITY FIX" comments below) was the same failure repeating: this file
 *     kept its OWN independent copy of the ~15 engine calls chat/stream/
 *     route.ts makes, so every engine added to the sync route required
 *     someone to remember to also add it here — and for a while, nobody did.
 *     Concretely, this file was missing: romance-engine (romantic-register
 *     style flavor), desire-engine (need/want/fear/obsession state
 *     tracking), the entire ~30-engine universe/world-simulation layer
 *     (weather, economy, culture, current events...), per-turn emotion
 *     detection (always planned against NEUTRAL_EMOTION instead of what the
 *     user actually just said), and cognition beliefs/companion-
 *     relationships/canonical-memory-arbitration.
 *
 *     The fix is structural: step 2 below now calls the same
 *     assembleCompanionContext() the sync route calls (see
 *     lib/ai/companion-context.ts's own header — it exists specifically to
 *     be "the canonical, single-object representation" both paths share),
 *     instead of re-implementing ~15 of its ~26 engine calls by hand. Going
 *     forward, any engine added to that one function reaches both paths by
 *     construction — there's no second copy left to forget. This also
 *     upgrades: emotion goes from always-neutral to a real detected +
 *     transitioned + persisted 28-state value (feeding the response
 *     planner, emotion-biased memory reranking, and the post-turn
 *     psychology event, same as the sync route); romance/desire are now
 *     wired in (style flavor + fulfillment-state nudging); universe context
 *     is injected into the prompt.
 *
 *     STILL NOT AT FULL PARITY, on purpose rather than by accident: the
 *     sync route's ~2,000-line executive-controller / decision-engine /
 *     attention-router intent-scoring system (S2-S21 relationship
 *     candidates) is deeply interleaved, turn-decision-making machinery —
 *     porting it safely is a dedicated task of its own, not something to
 *     fold into this pass. A queued (503-fallback) reply still plans
 *     against a simpler, more direct response-planner call instead of
 *     that full intent system, and does not get cognitionPrompt
 *     (runCognitionCycle's executive/drive/goal/task/attention decision).
 *     Flagged here so the next person (or the next me) finds this note
 *     instead of rediscovering the gap from a screenshot.
 *
 *   W6: SELF-MODEL / THEORY-OF-MIND / BELIEF-PIPELINE / REPUTATION PARITY
 *     FIX (optimize pass): W5 above originally grouped theory-of-mind,
 *     belief-pipeline, and reputation prompts in with the executive-
 *     controller system as "deeply interleaved, deliberately not
 *     ported" — checked against chat/stream/route.ts's actual call site,
 *     that wasn't accurate for these three (or self-model, which W5
 *     didn't mention at all). All four are independent, self-contained
 *     async calls needing only userId/characterId/character/psychology —
 *     see the Promise.all block in step 4 below, same shape as the sync
 *     route's own LATENCY-FIX comment. Only cognitionPrompt (genuinely
 *     built on executive-controller) remains out of scope.
 *
 * Previous fixes (unchanged):
 *   CRIT-2: supabaseAdmin (not createClient) throughout
 *   CRIT-3: decrement only on terminal paths
 *   CRIT-4: assembleFullPrompt with all 8 context layers
 *   DATING-1: dating context overlay
 */

import { after } from 'next/server';
import {
  dequeueNextJob, writeJobResult, requeueJob,
  acquireUserLock, releaseUserLock, decrementUserPendingCount,
  releaseJobLease, LEASE_MS,
  type ChatJob,
} from './index';
import { orchestrator }              from '@/lib/ai/orchestrator';
import { trimHistoryForPlan,
         historyLimitForTier }        from '@/lib/ai/token-budget';
import { assembleFullPrompt }        from '@/lib/ai/prompt';
import { resolveLanguageState }      from '@/lib/ai/language-engine';
import { loadSelfModel }             from '@/lib/ai/self-model';
import { loadTheoryOfMind }          from '@/lib/ai/theory-of-mind';
import { runBeliefPipeline }         from '@/lib/ai/belief-engine';
import { runReputationPipeline }     from '@/lib/ai/reputation-engine';
import { planResponse, formatPlanForPrompt } from '@/lib/ai/response-planner';
import { emotionEngine }             from '@/lib/ai/emotion-engine';
import { assembleDatingPrompt,
         type DatingPromptContext,
         type CharacterMood,
         type MatchTier }             from '@/lib/dating/engine';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { sanitize }                  from '@/lib/sanitize';
import { normalizeTier, checkCharacterTierAccess } from '@/lib/rate-limit';
import { checkMatureContentAccess } from '@/lib/access/character-gate';
import { logger, bg }                    from '@/lib/logger';
import { BgLedgerGroup }                 from '@/lib/observability/bg-ledger';
import { applyPsychologyEvent,
         detectAbsenceEvent }         from '@/lib/ai/attachment-engine';
import { addRelationshipXp }          from '@/lib/ai/relationship-engine';
import { shouldRevealLore,
         recordLoreDiscovery,
         maybeRecordFirstMeeting,
         generateAmbitionUpdate }     from '@/lib/ai/memory-graph';
import { updateMemory,
         formatMemoryForPrompt }      from '@/lib/ai/memory';
import { recordTurn }                 from '@/lib/memory-tiers/memory-tier-engine';
import { getEvolutionStage,
         computeSessionDrift }        from '@/lib/ai/personality-evolution';
import { detectEvolutionSignal,
         detectHabitSignal,
         recordEvolutionSignal,
         formatEvolutionTraitsForPrompt } from '@/lib/ai/bidirectional-evolution';
import { updateSessionBridge }        from '@/lib/ai/session-bridge';
import { getOrInitFingerprint,
         formatVoiceFingerprintForPrompt } from '@/lib/ai/voice-fingerprint';
import { getOrInitIdentityCore,
         maybeRefreshIdentityCore,
         formatIdentityCoreForPrompt }     from '@/lib/ai/identity-core';
import { extractAndStoreFacts,
         formatFactGraphForPrompt }   from '@/lib/ai/user-fact-graph';
import { scheduleMemoryTest, MIN_EXCHANGES_BEFORE_TEST } from '@/lib/ai/memory-test-engine';
import { enqueueBillingRetry }        from '@/lib/ai/billing-dlq';
import { formatMindForPrompt }        from '@/lib/mind/unified-mind';
import { checkStreak, progressQuest,
         awardXp }                    from '@/lib/growth/streak-rewards-engine';
// ENGINE-PARITY FIX (see file-header note below): these five all come from
// the single canonical assembler the sync route already uses, instead of
// this file's own independent copy of the same ~15 engine calls.
import { assembleCompanionContext }   from '@/lib/ai/companion-context';
import { applyEmotionBias,
         emotionToPsychologyEvent,
         setEmotionState }            from '@/lib/ai/emotion-state';
import { buildRomanceFragment }       from '@/lib/ai/romance-engine';
import { ensureCoreDesire,
         inferNudgeFromMessage,
         nudgeFulfillment }           from '@/lib/ai/desire-engine';

// ── Public: process one job from the queue ────────────────────────────────────

export async function processNextJob(): Promise<boolean> {
  const job = await dequeueNextJob();
  if (!job) return false;

  // QUEUE-LEASE-FIX: dequeueNextJob() has already started this job's
  // processing lease (see lib/queue/index.ts). Every return path below
  // must release it — wrapping the whole post-dequeue body in try/finally
  // guarantees that even the early-return branches (stale, concurrency
  // lock) clear it, so reapExpiredLeases() doesn't later mistake a job
  // this process actually finished handling for one whose worker died.
  try {
    // Stale check
    const ageMs = Date.now() - job.enqueuedAt;
    if (ageMs > 5 * 60 * 1000) {
      await writeJobResult({
        jobId: job.id, userId: job.userId,
        status: 'failed', error: 'Job expired in queue (stale after 5 min)',
        doneAt: Date.now(),
      });
      await decrementUserPendingCount(job.userId);
      return true;
    }

    // Concurrency lock — TTL matches the job's own processing lease
    // (LEASE_MS), not a shorter fixed value. A lock TTL below the lease
    // could expire while a legitimately slow job was still running,
    // letting a second concurrent job start for the same user; see the
    // LEASE_MS comment in lib/queue/index.ts. The lock is still released
    // explicitly in the `finally` below the instant a job actually
    // finishes, so this only widens the crash-recovery window, not normal
    // per-job latency.
    const locked = await acquireUserLock(job.userId, LEASE_MS / 1000);
    if (!locked) {
      if (job.attempts < job.maxAttempts) {
        await requeueJob(job);
      } else {
        await writeJobResult({
          jobId: job.id, userId: job.userId,
          status: 'dead', error: 'Max concurrency retries exceeded',
          doneAt: Date.now(),
        });
        await decrementUserPendingCount(job.userId);
      }
      return true;
    }

    try {
      const result = await executeJob(job);
      await writeJobResult({ jobId: job.id, userId: job.userId, status: 'done', ...result, doneAt: Date.now() });
      await decrementUserPendingCount(job.userId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Worker job failed', { jobId: job.id, userId: job.userId, error: errMsg, attempt: job.attempts });

      if (job.attempts + 1 < job.maxAttempts) {
        await requeueJob(job);
      } else {
        await writeJobResult({
          jobId: job.id, userId: job.userId, status: 'dead',
          error: `Exhausted ${job.maxAttempts} attempts. Last: ${errMsg}`,
          doneAt: Date.now(),
        });
        await decrementUserPendingCount(job.userId);
      }
    } finally {
      await releaseUserLock(job.userId);
    }

    return true;
  } finally {
    await releaseJobLease(job.id);
  }
}

// ── Private: execute one job ──────────────────────────────────────────────────

async function executeJob(job: ChatJob): Promise<{ reply: string; tokensUsed: number }> {
  const tier    = normalizeTier(job.tier);
  const traceId = `queue-${job.id}`;
  const userId  = job.userId;
  const characterId = job.characterId;

  // ── 1. Orchestrator prepare ───────────────────────────────────────────────
  const ctx = await orchestrator.prepare({ userId, tier, characterId, conversationId: job.conversationId, traceId });
  if (job.originTraceId) ctx.tracer.event('queue.origin_trace', { originTraceId: job.originTraceId, jobId: job.id });

  // ── 2. W1/W5: Parallel load — character + history + canonical context ────
  // Previously: character load  await  history load  await  context load.
  // Now: all four in one Promise.all(). The third leg used to be this
  // file's own ~11-engine Promise.all; it's now a single call to
  // assembleCompanionContext() — the same canonical assembler chat/stream/
  // route.ts uses (see W5 in the file header above for why).
  const historyLimit = historyLimitForTier(tier);

  const [characterResult, historyResult, companionContext, profileResult] = await Promise.all([
    // Character
    supabaseAdmin
      .from('characters')
      .select('name,description,personality,scenario,backstory,tags,age,gender,origin,occupation,values_list,fears,flaws,speech_style,current_goal,goal_progress,daily_routine,friends_list,secrets,char_openness,char_warmth,char_adventure,char_depth,is_premium,min_tier,is_nsfw,creator_id')
      .eq('id', characterId)
      .single(),

    // Conversation history
    job.conversationId
      ? supabaseAdmin.from('messages').select('role,content')
          .eq('conversation_id', job.conversationId)
          .order('created_at', { ascending: true })
          .limit(historyLimit)
      : Promise.resolve({ data: [] }),

    // Canonical companion context — psychology, relationship, memory
    // (graph/facts/priority/seed/factGraph/discoveredLore/dynamicInterests),
    // evolutionTraits, emotion, coreDesire/fulfillment, beliefs,
    // companionRelationships, unified-mind fortune, and universe/world
    // context all come from this one call now. `character` is passed as
    // null (same as route.ts's own call) since assembleCompanionContext
    // never fetches it — it's only stored back onto the object for
    // structural completeness; this file reads the real row from
    // characterResult above instead.
    assembleCompanionContext({
      userId, characterId, conversationId: job.conversationId ?? null,
      message: job.message, character: null,
    }),

    // User's self-reported gender and response-language preference — so the
    // character can address/understand them naturally and reply in the
    // right language (see lib/ai/prompt.ts describeUserGender() and
    // lib/ai/language-engine.ts).
    supabaseAdmin.from('profiles').select('gender,preferred_language').eq('id', userId).single(),
  ]);

  const character = characterResult.data;
  if (!character) throw new Error(`Character ${characterId} not found`);

  const premiumGate = checkCharacterTierAccess(
    tier,
    (character as Record<string, unknown>).min_tier as typeof tier | null | undefined,
    !!(character as Record<string, unknown>).is_premium,
    (character as Record<string, unknown>).creator_id != null,
  );
  if (!premiumGate.allowed) {
    throw new Error(`PREMIUM_CHARACTER_REQUIRED: ${premiumGate.reason ?? 'character requires a higher plan'}`);
  }

  // SEC: the enqueue route checks mature-content access at submit time,
  // but a queued job can execute seconds to minutes later — long enough
  // for a user to flip nsfw_enabled off, or for age-verification status
  // to change. Recheck here at execution time, the same way premiumGate
  // above is already rechecked rather than trusted from enqueue.
  const matureGate = await checkMatureContentAccess(
    userId,
    !!(character as Record<string, unknown>).is_nsfw,
    tier,
  );
  if (!matureGate.allowed) {
    throw new Error(`MATURE_CONTENT_BLOCKED: ${matureGate.reason ?? 'mature content is currently unavailable'}`);
  }

  const rawHistory = (historyResult.data ?? []) as { role: string; content: string }[];
  const history    = trimHistoryForPlan(rawHistory, tier);

  const {
    relationship: { psychology, relationship, evolutionTraits },
    memory: {
      graph: memoryGraph, facts: memoryFacts, priority: priorityMemories,
      seed: seedMemories, factGraph, dynamicInterests, discoveredLore,
    },
    state: { emotion: previousEmotion, coreDesire, fulfillment: desireFulfillment },
    cognition: { companionRelationships, fortune: unifiedMind, tieredMemory },
    conversation: { sessionBridge },
    world: { universeContext },
  } = companionContext;

  // ── 2.5 Per-turn emotion detection + transition (W5) ─────────────────────
  // Pure in-process, zero added latency (see emotion-engine.ts's own
  // header). Previously this file always planned against NEUTRAL_EMOTION
  // — now it detects what the user actually just said, transitions from
  // the real persisted previous state (companionContext.state.emotion,
  // above), and persists the result for the next turn, same as the sync
  // route's emotionEngine.detectFromText / .transition / setEmotionState
  // sequence.
  const sessionCountForEmotion = rawHistory.length;
  const detectedEmotion        = emotionEngine.detectFromText(job.message);
  const emotionTransitioned    = emotionEngine.transition(previousEmotion, detectedEmotion, sessionCountForEmotion);
  const emotionInstructions    = emotionEngine.buildPromptInstructions(emotionTransitioned);
  after(() => setEmotionState(userId, characterId, emotionTransitioned).catch(bg('setEmotionState')));

  // Emotion-biased re-ranking of already-fetched memories — zero extra DB
  // cost, same as the sync route.
  const rankedMemoryGraph = applyEmotionBias(memoryGraph, emotionTransitioned);

  // ── 3. Absence detection + lore reveal ───────────────────────────────────
  const absenceEvent = detectAbsenceEvent(psychology.last_interaction);
  if (absenceEvent) after(() => applyPsychologyEvent(userId, characterId, absenceEvent).catch(bg('applyPsychologyEvent.absence')));

  let loreToReveal: string | null = null;
  let loreDiscoveryKey: string | null = null;
  if (Array.isArray(character.secrets) && character.secrets.length) {
    const reveal = shouldRevealLore(psychology.total_interactions, discoveredLore, character.secrets as string[]);
    if (reveal) {
      loreToReveal = reveal.content;
      loreDiscoveryKey = reveal.key;
      after(() => {
        recordLoreDiscovery(userId, characterId, reveal.key, reveal.content, character.name).catch(bg('recordLoreDiscovery'));
        applyPsychologyEvent(userId, characterId, 'lore_discovered').catch(bg('applyPsychologyEvent.loreDiscovered'));
      });
    }
  }

  const evolutionStage = getEvolutionStage(psychology.days_known, psychology.total_interactions);
  const evolutionTraitsPrompt = formatEvolutionTraitsForPrompt(evolutionTraits);

  // PARITY FIX: mirror chat/stream/route.ts's memory-test scheduling here too
  // — this queued (503-fallback) path builds the same seedMemories context,
  // so it should drive the same scheduleMemoryTest() side effect rather than
  // silently depending on the user's next turn happening to hit the sync path.
  if (psychology.total_interactions >= MIN_EXCHANGES_BEFORE_TEST) {
    for (const sm of seedMemories) {
      if (sm.is_testable) {
        after(() => scheduleMemoryTest(userId, characterId, sm.id).catch(bg('scheduleMemoryTest')));
      }
    }
  }

  // ── 4. Prompt assembly ────────────────────────────────────────────────────
  // SELF-MODEL/THEORY-OF-MIND/BELIEF/REPUTATION PARITY FIX (optimize pass —
  // "make cognition engines actually show up in chat responses"): the W5
  // note above (file header) grouped these four in with the ~2,000-line
  // executive-controller/decision-engine intent-scoring system as "deeply
  // interleaved, deliberately not ported" — but checked against
  // chat/stream/route.ts's actual call site, that's not accurate for these
  // four specifically. loadSelfModel/loadTheoryOfMind/runBeliefPipeline/
  // runReputationPipeline are independent, self-contained async calls that
  // only need userId/characterId/character/psychology — all already in
  // scope here — with the exact same try/catch-to-null-or-default fallback
  // shape the sync route uses. Only cognitionPrompt (runCognitionCycle,
  // genuinely built on executive-controller) stays out of scope, per that
  // same file-header note — this fix is scoped to the other four.
  //
  // Concretely, this closes the gap for every user on the queued
  // (503-fallback) path — i.e. exactly the moments the platform is under
  // load and a companion's personality depth matters most to preserve:
  // previously they got a character with no self-model (identity/values/
  // beliefs/self-image/self-esteem/purpose — self-model.ts composes all
  // six), no theory-of-mind (character/user/social models + trust), no
  // belief-pipeline expectations, and no reputation read on the user — a
  // visibly flatter companion than the sync path's, with no user-facing
  // signal that anything was different.
  //
  // Same Promise.all shape as the sync route's own LATENCY-FIX comment:
  // none of the four depend on each other's result, so run them together
  // rather than four sequential awaits.
  const [selfModel, theoryOfMind, beliefPipeline, reputationPipeline] = await Promise.all([
    loadSelfModel(
      userId, characterId,
      character as unknown as Parameters<typeof loadSelfModel>[2],
      psychology,
    ),
    loadTheoryOfMind(
      userId, characterId,
      { char_warmth: (character as Record<string, unknown>).char_warmth as number | null | undefined },
    ).catch((err) => {
      logger.warn('worker: theory-of-mind load failed', { userId, characterId, error: String(err) });
      return null;
    }),
    runBeliefPipeline(userId, characterId).catch((err) => {
      logger.warn('worker: belief-pipeline load failed', { userId, characterId, error: String(err) });
      return null;
    }),
    runReputationPipeline(userId, characterId).catch((err) => {
      logger.warn('worker: reputation-pipeline load failed', { userId, characterId, error: String(err) });
      return null;
    }),
  ]);

  // Response language — parity with chat/stream/route.ts. Same
  // user+character Redis key, so smoothing state is shared across the
  // synchronous and queued (503-fallback) paths rather than each keeping
  // its own view of what language the conversation is in.
  let languagePrompt = '';
  try {
    const languageState = await resolveLanguageState(userId, characterId, job.message, profileResult.data?.preferred_language ?? null);
    languagePrompt = languageState.promptBlock;
  } catch (err) {
    logger.warn('worker: language engine failed', { userId, characterId, error: String(err) });
  }

  const bondScore = relationship?.bond_score ?? 0;

  let systemPrompt = assembleFullPrompt({
    character,
    psychology, relationship,
    memories:         rankedMemoryGraph,
    evolutionStage,   dynamicInterests,
    evolutionTraitsPrompt,
    memoryFacts:      formatMemoryForPrompt(memoryFacts),
    loreToReveal,
    userGender:       profileResult.data?.gender ?? null,
    priorityMemories,
    seedMemories,
    languagePrompt,
    // W5: previously omitted — see the emotion-detection block above and
    // the file-header note on what's still not full parity.
    emotionInstructions,
    bondScore,
    companionRelationships,
    tieredMemoryPrompt: tieredMemory.promptBlock,
    selfModelPrompt:      selfModel.promptBlock,
    theoryOfMindPrompt:   theoryOfMind?.promptBlock ?? null,
    beliefPipelinePrompt: beliefPipeline?.promptBlock ?? null,
    reputationPrompt:     reputationPipeline?.promptBlock ?? null,
  });

  // W2: Session bridge
  if (sessionBridge?.bridgePrompt) {
    systemPrompt = sessionBridge.bridgePrompt + '\n\n' + systemPrompt;
  }

  // W2: Voice fingerprint
  const fingerprint = await getOrInitFingerprint(userId, characterId, character.speech_style ?? null, psychology.total_interactions);
  if (fingerprint) {
    systemPrompt = systemPrompt + '\n\n' + formatVoiceFingerprintForPrompt(fingerprint);
  }

  // Unified Mind — single fortune/self-awareness composite across
  // character-evolution, reputation, social-graph, and belief-engine (see
  // lib/mind/unified-mind.ts). W5: now comes from the same
  // assembleCompanionContext() call above (cognition.fortune) instead of a
  // second, independent getUnifiedMind() fetch — same value, one less
  // duplicate DB/Redis round trip per queued job.
  if (unifiedMind) {
    systemPrompt = systemPrompt + '\n\n' + formatMindForPrompt(unifiedMind);
  }

  // W5: Romance/romanticism flavor layer — style-only, derived purely from
  // the existing bond score and time-apart signals, same as the sync
  // route's romance-engine.ts call. Never reacts to disclosed vulnerability;
  // never touches the crisis break-character path (owned by prompt.ts,
  // upstream of this file entirely).
  const hoursSinceLastMsg = psychology.last_interaction
    ? (Date.now() - new Date(psychology.last_interaction).getTime()) / 3_600_000
    : 0;
  const romanceFragment = buildRomanceFragment({
    relationshipStageScore: Math.max(0, Math.min(1, bondScore / 100)),
    daysSinceLastMessage:   hoursSinceLastMsg / 24,
    emotion:                emotionTransitioned,
  });
  systemPrompt = systemPrompt + '\n\n[Romantic register: ' + romanceFragment.register + ']\n' + romanceFragment.styleInstruction;

  // W5: Universe/world context — location, social graph, active events/
  // stories, life/job/status/reputation/economy/weather/culture/etc (~30
  // sub-engines, see universe-prompt.ts). Already resolved to '' by
  // assembleCompanionContext's own fail-open wrapper if anything in there
  // errored, so this concatenation is always safe. This was entirely
  // absent from queued replies before W5 — see file header.
  if (universeContext) {
    systemPrompt = systemPrompt + universeContext;
  }

  // W5: Desire-engine state tracking — bootstrap + nudge, same as the sync
  // route. Fire-and-forget; this turn's prompt already got the desire
  // flavor text via universeContext above (formatDesireForPrompt is one of
  // its ~30 sub-engines), so this only updates state for future turns, it
  // doesn't need to block this response.
  after(() => ensureCoreDesire(characterId, { name: character?.name ?? '' }).catch(bg('ensureCoreDesire')));
  if (coreDesire) {
    const nudge = inferNudgeFromMessage(job.message, coreDesire);
    if (Object.keys(nudge).length > 0) {
      after(() => nudgeFulfillment(characterId, userId, nudge).catch(bg('nudgeFulfillment')));
    }
  }
  void desireFulfillment; // reserved for when this file wires the decision-engine intent pass (see file header) — read here so the destructure above stays self-documenting

  // Identity Core — automatic self-model layer (see identity-core.ts). Parity
  // with chat/stream/route.ts's wiring.
  const identityCore = await getOrInitIdentityCore(
    userId, characterId,
    character as unknown as Parameters<typeof getOrInitIdentityCore>[2],
    psychology,
  );
  if (identityCore) {
    systemPrompt = systemPrompt + '\n\n' + formatIdentityCoreForPrompt(identityCore);
    after(() => maybeRefreshIdentityCore(
      userId, characterId,
      character as unknown as Parameters<typeof getOrInitIdentityCore>[2],
      psychology,
      {
        memoryHighlights:  memoryGraph.slice(0, 6).map(m => `${m.title}: ${m.description}`),
        priorityHeadlines: priorityMemories.slice(0, 6).map(m => m.headline),
        dynamicInterests,
      },
    ).catch(bg('maybeRefreshIdentityCore')));
  }

  // W2: User fact graph
  const factGraphPrompt = formatFactGraphForPrompt(factGraph);
  if (factGraphPrompt) systemPrompt = systemPrompt + '\n\n' + factGraphPrompt;

  // ── 5. Dating overlay ─────────────────────────────────────────────────────
  if (job.datingMode && job.matchId) {
    try {
      const { data: match } = await supabaseAdmin
        .from('dating_matches')
        .select('bond_score,match_tier,character_mood,streak_days,milestones')
        .eq('id', job.matchId).eq('user_id', userId)
        .single();

      if (match) {
        const milestoneFlagMap: Record<string, number> = { soulmate: 16, week_streak: 8, first_gift: 4, deep_talk: 2, first_chat: 1 };
        const recentMilestone = Object.entries(milestoneFlagMap).find(([, f]) => (match.milestones ?? 0) & f)?.[0];
        const { data: gifts } = await supabaseAdmin
          .from('dating_gifts')
          .select('gift_name,created_at')
          .eq('match_id', job.matchId)
          .order('created_at', { ascending: false })
          .limit(1);
        const datingCtx: DatingPromptContext = {
          characterName: character.name,
          matchTier:     (match.match_tier as MatchTier) ?? 'spark',
          bondScore:     match.bond_score ?? 0,
          characterMood: (match.character_mood as CharacterMood) ?? 'happy',
          streakDays:    match.streak_days ?? 0,
          lastGiftName:  gifts?.[0]?.gift_name,
          recentMilestone,
        };
        systemPrompt = assembleDatingPrompt(systemPrompt, datingCtx);
      }
    } catch (err) {
      logger.warn('Worker: dating context failed, using base prompt', { jobId: job.id, error: String(err) });
    }
  }

  // ── 5.5 Response planner: separate think-before-you-speak stage ─────────
  // W5: now plans against the real detected+transitioned emotion from the
  // block above instead of a hardcoded NEUTRAL_EMOTION — this file still
  // omits the full executive-controller/decision-engine intent pass (see
  // file header), but the planner itself no longer has to pretend every
  // queued message is emotionally flat. Fails open internally either way,
  // never blocks the job.
  const plan = await planResponse({
    characterName:    character.name,
    characterSummary: [character.personality, character.occupation, character.current_goal]
      .filter(Boolean).join(' — ').slice(0, 400),
    recentMessages:   history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    emotion:          emotionTransitioned,
    relationshipStage: relationship?.stage,
    traceId,
  });
  systemPrompt = systemPrompt + formatPlanForPrompt(plan);

  const messagesPayload = [
    { role: 'system'    as const, content: systemPrompt },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user'      as const, content: sanitize(job.message) },
  ];

  // ── 6. Infer ──────────────────────────────────────────────────────────────
  const result = await orchestrator.infer(ctx, messagesPayload);
  const { reply, tokensUsed } = result;

  // ── 7. Persist messages ───────────────────────────────────────────────────
  if (job.conversationId) {
    await Promise.all([
      supabaseAdmin.from('messages').insert([
        { conversation_id: job.conversationId, role: 'user',      content: sanitize(job.message) },
        { conversation_id: job.conversationId, role: 'assistant', content: reply },
      ]),
      supabaseAdmin.from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', job.conversationId),
    ]);
  }

  // ── 8. W4: Billing with DLQ fallback ─────────────────────────────────────
  try {
    await orchestrator.finish(ctx, result);
  } catch (finishErr) {
    logger.error('Worker: orchestrator.finish failed — enqueuing DLQ', {
      userId, tokensUsed, traceId,
      error: finishErr instanceof Error ? finishErr.message : String(finishErr),
    });
    await enqueueBillingRetry(userId, tokensUsed, traceId);
  }

  // ── 9. W3: Post-job enrichment (all fire-and-forget, but wrapped in
  // after() — the route awaits Promise.allSettled() over all jobs in the
  // batch before responding, so without after() these races the route's
  // response exactly like the sync/streaming chat routes did. See ARCH-04.
  //
  // LEDGER: every task below is tracked through a BgLedgerGroup instead of
  // the bare `.catch(bg(label))` this block used previously. Behavior is
  // identical (immediate fire-and-forget, failure logged, never thrown) —
  // group.flush() additionally persists all outcomes to bg_task_ledger in
  // one batched RPC call so failures here are queryable, not just grep-able.
  // See src/lib/observability/bg-ledger.ts. This also brings the two RPC
  // calls below (apply_personality_drift, increment_daily_messages) under
  // the same failure visibility — previously both were fired with a bare
  // `void`, so a failing drift update or message-count increment produced
  // no log line and no trace anywhere.
  after(async () => {
    const group = new BgLedgerGroup();

    const sessionCount = rawHistory.length;
    const isLong       = sessionCount >= 30;
    const positive      = /thank|love|miss|happy|great|amazing/i.test(job.message);

    group.track('applyPsychologyEvent.baseline', applyPsychologyEvent(userId, characterId, isLong ? 'long_session' : 'message_sent'));
    if (positive) group.track('applyPsychologyEvent.compliment', applyPsychologyEvent(userId, characterId, 'compliment'));
    // W5: full 28-state emotion-aware event, additive alongside the regex-based
    // compliment check above — same as chat/stream/route.ts's own emotionEvent
    // wiring (see emotion-state.ts's header on why this replaces a plain
    // regex for cases the regex can't see: distress, reconciliation, an
    // argument beat).
    const emotionEvent = emotionToPsychologyEvent(previousEmotion, emotionTransitioned);
    if (emotionEvent) group.track('applyPsychologyEvent.emotion', applyPsychologyEvent(userId, characterId, emotionEvent));
    group.track('addRelationshipXp', addRelationshipXp(userId, characterId, isLong ? 'long_session' : 'message_sent'));
    group.track('maybeRecordFirstMeeting', maybeRecordFirstMeeting(userId, characterId, character.name));
    group.track('updateMemory', updateMemory(userId, characterId, character.name, job.message, reply, sessionCount + 1));
    // MEMORY-TIERS: parity with chat/stream/route.ts's fire-and-forget wiring.
    // `tier` (normalizeTier(job.tier), resolved above) is forwarded so the
    // queued path gets the same premium buffer/retention behavior as the
    // live SSE path — see short-term-memory.ts's tiering note.
    group.track('recordTurn.user', recordTurn(userId, characterId, 'user', job.message, tier));
    group.track('recordTurn.character', recordTurn(userId, characterId, 'character', reply, tier));
    group.track('extractAndStoreFacts', extractAndStoreFacts(userId, characterId, job.message, reply, sessionCount + 1));

    const evolutionSignal = detectEvolutionSignal(job.message);
    if (evolutionSignal) group.track('recordEvolutionSignal', recordEvolutionSignal(userId, characterId, evolutionSignal));
    const habitSignal = detectHabitSignal(new Date().getHours(), job.message);
    if (habitSignal) group.track('recordEvolutionSignal.habit', recordEvolutionSignal(userId, characterId, habitSignal));

    if ((sessionCount + 1) % 10 === 0) {
      const drift = computeSessionDrift(psychology.days_known, psychology.total_interactions, sessionCount + 1, positive);
      group.track('applyPersonalityDrift', Promise.resolve(supabaseAdmin.rpc('apply_personality_drift', {
        p_user_id: userId, p_character_id: characterId,
        p_openness: Math.round(drift.openness), p_warmth: Math.round(drift.warmth),
        p_confidence: Math.round(drift.confidence),
      })));
    }

    group.track('checkStreak', checkStreak(userId));
    group.track('progressQuest.messages', progressQuest(userId, 'messages', 1));
    if (isLong) group.track('progressQuest.longSession', progressQuest(userId, 'long_session', 1));
    group.track('awardXp', awardXp(userId, isLong ? 25 : 2, isLong ? 'long_session' : 'message_sent'));
    group.track('incrementDailyMessages', Promise.resolve(supabaseAdmin.rpc('increment_daily_messages', { p_user_id: userId })));

    if (job.conversationId) {
      const allMessages = [
        ...rawHistory,
        { role: 'user', content: job.message },
        { role: 'assistant', content: reply },
      ];
      group.track('updateSessionBridge', updateSessionBridge(userId, characterId, job.conversationId, allMessages));
    }

    if (character.current_goal) {
      group.track('generateAmbitionUpdate', generateAmbitionUpdate(userId, characterId, character.name, character.current_goal, character.goal_progress ?? 0));
    }

    await group.flush({ userId });
  });

  return {
    reply, tokensUsed,
    // JOURNEY-GAP-FIX parity with chat/stream/route.ts: without this, a
    // message sent via the queue fallback (network hiccup on the primary
    // SSE path) would silently never render the world-reference tap chip,
    // permanently undercounting worldReferenceTappedCount for exactly the
    // users whose connection is flaky enough to hit this path most often.
    ...(loreToReveal ? { loreReveal: { key: loreDiscoveryKey!, content: loreToReveal } } : {}),
  };
}
