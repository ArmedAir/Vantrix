/**
 * Automatic Behavior — Vantrix Cognition Layer
 *
 * Top of the habit  routine  automatic-behavior chain (see
 * habit-engine.ts's header). executive-controller.ts (this directory)
 * always pays for ai/executive-controller.ts's full pipeline — drives,
 * goal, task, attention-router, confidence/uncertainty — every single
 * turn, deliberately, because that module's whole job is the "choose
 * before speak" path. This module is the check that should run *before*
 * that: given this turn's cue, is there a habit or in-progress routine
 * strong/specific enough that firing it costs nothing and deliberating
 * anyway would be wasted work?
 *
 *   habit-engine.ts        — individual cue  response strength
 *   routine-engine.ts      — ordered sequences of habit cues
 *   automatic-behavior.ts  (this file) — the fast-path decision gate
 *
 * This is explicitly a *gate*, not a replacement: consider() below never
 * calls into executive-controller.ts itself, and a caller is always free
 * to ignore its result and run the full deliberate pipeline anyway (a
 * watch_flag in working memory, an active plan in planner.ts, or simply
 * low confidence in the returned Decision are all good reasons to). The
 * intended call site is right at the top of consciousness-loop.ts's
 * runConsciousnessCycle(), before executive-controller.ts's decide()
 * step — same "cheap check first" ordering attention-engine.ts already
 * uses ahead of the controller.
 *
 * GAP-FIX: considerAutomaticResponse() / recordAutomaticOutcome() are now
 * async because habit-engine.ts's store moved from an in-process Map to
 * habit-store.ts (Redis-cached Supabase) — see habit-engine.ts's header
 * for why.
 *
 * GAP-FIX (call-site wiring): consciousness-loop.ts now calls
 * considerAutomaticResponse() first thing in runConsciousnessCycle() when
 * a cue is supplied (see that file), and chat/stream/route.ts derives
 * that cue via deriveHabitCue() below and calls recordAutomaticOutcome()
 * once the turn's outcome is known. The cue-detection step this needed
 * didn't exist anywhere in the codebase before now — deriveHabitCue() is
 * a first-pass heuristic classifier, not a full intent model; see its own
 * doc comment for why that's an acceptable tradeoff for a gate this cheap.
 */

import { logger } from '@/lib/logger';
import {
  getDominantHabit,
  recordHabitOutcome,
  type HabitCue,
  type Habit,
} from '@/lib/cognition/habit-engine';
import {
  routinesAwaitingCue,
  advanceRoutine,
  activeStep,
  type Routine,
} from '@/lib/cognition/routine-engine';

// ── Types ───────────────────────────────────────────────────────────────

export type AutomaticSource = 'habit' | 'routine';

export interface AutomaticDecision {
  /** True if a fast-path response was found and it's safe to skip
   *  full deliberation this turn. False means "defer" — the caller
   *  should fall through to executive-controller.ts as normal. */
  fire: boolean;
  source: AutomaticSource | null;
  /** Short, prompt-ready description of the automatic response, if fire is true. */
  response: string | null;
  /** The habit/routine that produced this decision, for the caller to
   *  pass back into recordAutomaticOutcome() once the result is known. */
  habit: Habit | null;
  routine: Routine | null;
}

// A watch_flag or anything else safety-relevant should always defer to
// full deliberation — automatic behavior is an optimization for routine
// moments, never a way to skip the checks that matter.
export interface AutomaticContext {
  /** True if this turn has anything safety/moderation-relevant live —
   *  callers typically pass working-memory.ts's activeWatchFlags.length > 0. */
  hasWatchFlag: boolean;
}

// ── Cue derivation ──────────────────────────────────────────────────────

export interface HabitCueInput {
  /** The user's raw message text for this turn, pre-sanitize is fine —
   *  only read here, never persisted or echoed. */
  message: string;
  /** True on this pair's very first turn (route.ts already computes this
   *  as `sessionCount === 0` for S1/session-bridge purposes) — checked
   *  first since an opening message can otherwise look like `silence`
   *  (short) or `other`. */
  isOpeningMessage: boolean;
  /** This turn's already-computed emotion read (emotion-engine.ts's
   *  transition() output) — no new detection work, just reused. */
  emotion: { valence: number; intensity: number };
  /** Open threads already fetched this turn (same list attention-signal
   *  building already iterates) — used only to check whether the user's
   *  message plausibly revives one of them. */
  openThreads: Array<{ subject: string }>;
}

const FAREWELL_RE = /\b(bye|goodbye|good ?night|gtg|got to go|gotta go|talk (to you )?later|ttyl|logging off|heading (out|to bed)|see you (later|soon|tomorrow)|catch you later)\b/i;
const COMPLIMENT_RE = /\b(you'?re (amazing|awesome|the best|incredible|so (sweet|kind|smart|funny|talented|beautiful|handsome|great))|i love (you|this|that)|so proud of you|great job|well done|you did (great|amazing|so well))\b/i;

/**
 * Classify this turn's cue for considerAutomaticResponse()/habit-engine.ts
 * lookups. Deliberately cheap and heuristic — every branch here is a
 * keyword/threshold check over data the caller already computed, no new
 * fetches or model calls, matching this gate's whole reason for existing
 * (see this file's header). Misclassification is low-stakes by
 * construction: a wrong cue just means getDominantHabit()/
 * routinesAwaitingCue() look up the wrong (probably empty) bucket, which
 * falls through to `fire: false` — full deliberation, same as today.
 * This is a first pass; a real intent/sentiment classifier is a
 * reasonable follow-up if the heuristics below prove too blunt in
 * practice, but "cheap and roughly right" beats "no cue detection at
 * all," which was the actual status quo before this function existed.
 */
export function deriveHabitCue(input: HabitCueInput): HabitCue {
  if (input.isOpeningMessage) return 'greeting';

  const text = input.message.trim();
  if (FAREWELL_RE.test(text)) return 'goodbye';

  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).length;
  if (wordCount > 0 && wordCount <= 2) return 'silence';

  const lower = text.toLowerCase();
  const revivesOpenThread = input.openThreads.some(t => {
    const keywords = t.subject.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return keywords.length > 0 && keywords.some(w => lower.includes(w));
  });
  if (revivesOpenThread) return 'callback';

  if (COMPLIMENT_RE.test(text)) return 'compliment';

  if (input.emotion.valence > 0.5 && input.emotion.intensity > 0.5) return 'good_news';
  if (input.emotion.valence < -0.5 && input.emotion.intensity > 0.5) return 'bad_news';

  return 'other';
}

// ── Decide ──────────────────────────────────────────────────────────────

/**
 * Check whether this turn's cue is covered by a strong-enough habit or
 * an in-progress routine waiting on exactly this cue. Routines take
 * priority over standalone habits when both match — a routine already
 * in flight represents more established context than a bare cueresponse
 * pair. Pure read — does not mutate anything itself; call
 * recordAutomaticOutcome() afterward once the reaction is known.
 */
export async function considerAutomaticResponse(
  userId: string,
  characterId: string,
  cue: HabitCue,
  context: AutomaticContext,
): Promise<AutomaticDecision> {
  if (context.hasWatchFlag) {
    logger.debug('[cognition/automatic-behavior] deferred: watch flag active', {
      userId, characterId, cue,
    });
    return { fire: false, source: null, response: null, habit: null, routine: null };
  }

  const waitingRoutines = routinesAwaitingCue(userId, characterId, cue);
  if (waitingRoutines.length > 0) {
    const routine = waitingRoutines[0];
    const step = activeStep(routine);
    logger.debug('[cognition/automatic-behavior] fired from routine', {
      userId, characterId, cue, routineId: routine.id,
    });
    return {
      fire: true,
      source: 'routine',
      response: step?.description ?? null,
      habit: null,
      routine,
    };
  }

  const habit = await getDominantHabit(userId, characterId, cue);
  if (habit) {
    logger.debug('[cognition/automatic-behavior] fired from habit', {
      userId, characterId, cue, habitId: habit.id, strength: habit.strength,
    });
    return { fire: true, source: 'habit', response: habit.response, habit, routine: null };
  }

  return { fire: false, source: null, response: null, habit: null, routine: null };
}

// ── Report outcome ──────────────────────────────────────────────────────

/**
 * Feed back whether firing the automatic response actually landed well,
 * so habit-engine.ts's reinforcement and routine-engine.ts's advancement
 * both stay accurate. Call once per turn a decision from
 * considerAutomaticResponse() was actually used.
 */
export async function recordAutomaticOutcome(
  userId: string,
  characterId: string,
  turn: number,
  cue: HabitCue,
  decision: AutomaticDecision,
  rewarded: boolean,
): Promise<void> {
  if (decision.source === 'habit' && decision.habit) {
    await recordHabitOutcome(userId, characterId, turn, cue, decision.habit.response, rewarded);
    return;
  }

  if (decision.source === 'routine' && decision.routine && rewarded) {
    advanceRoutine(userId, characterId, decision.routine.id, turn, cue);
  }
}

export function formatAutomaticDecisionForPrompt(decision: AutomaticDecision): string {
  if (!decision.fire || !decision.response) return '';
  // Labeled the same way habit-engine.ts's own formatHabitsForPrompt()
  // labels its output, so this reads as one consistency-relevant fact
  // among the other S2-S21 blocks rather than an unexplained fragment —
  // it's a *lean toward*, not a script to recite verbatim.
  return `This turn's established pattern (lean into it for consistency): ${decision.response}`;
}
