/**
 * Content Moderation — Vantrix Silicon Valley
 *
 * Multi-layer moderation gate applied before any user-generated character
 * content is persisted. Layers:
 *
 *   1. Fast blocklist check (sync, < 1ms) — catches obvious violations
 *   2. OpenRouter moderation endpoint (async, ~200ms) — catches nuanced content
 *
 * Phase 2 AI-wiring cleanup: layer 2 now routes through
 * @/lib/ai/capability's generateStructured(), which itself goes through
 * provider-router.ts (env-validated OPENROUTER_API_KEY / NEXT_PUBLIC_APP_URL
 * live there now) instead of this file holding its own private fetch.
 */

import { logger }        from '@/lib/logger';
import { generateStructured } from '@/lib/ai/capability';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { retry }         from '@/lib/network/retry';
import { checkKeywordsForHold } from '@/lib/moderation/keyword-watch';

export interface ModerationResult {
  allowed:   boolean;
  category?: string;
  reason?:   string;
}

// ── Layer 1: Fast keyword blocklist ──────────────────────────────────────

const BLOCKED_PATTERNS: Array<{ re: RegExp; category: string; reason: string }> = [
  {
    re:       /\b(child|minor|underage|preteen|kid|loli|shota)\b/i,
    category: 'minors',
    reason:   'Content involving or referencing minors is not permitted.',
  },
  {
    // FALSE-POSITIVE FIX (2026-09-07): "assault" as a bare word blocked
    // completely ordinary genre content that has nothing to do with sexual
    // violence — "assault rifle", "assault the castle gates", "an obstacle
    // assault course" — anything with an action/fantasy/military sense of
    // the word got tagged 'sexual_violence' and rejected outright. Real
    // sexual-assault content is still caught: "rape", "non-con", "molest"
    // are unambiguous on their own, and the two explicit phrases below
    // catch "assault" specifically in its sexual sense without matching
    // every other ordinary use of the word. This narrows false positives;
    // it does not narrow what actually gets blocked.
    re:       /\b(rape|non-?con|sexual(?:ly)? assault|assault(?:ed|ing)? sexually|molest)\b/i,
    category: 'sexual_violence',
    reason:   'Non-consensual content is not permitted.',
  },
  {
    re:       /\b(nazi|white supremac|ethnic cleansing|genocide)\b/i,
    category: 'hate',
    reason:   'Hate content is not permitted.',
  },
  {
    re:       /\b(bomb making|how to kill|murder instructions|weapon craft)\b/i,
    category: 'violence',
    reason:   'Content that facilitates real-world violence is not permitted.',
  },
  {
    re:       /\b(slavery|slave owner|trafficking|human exploit|sexual exploit)\b/i,
    category: 'exploitation',
    reason:   'Exploitation content is not permitted.',
  },
];

function blocklistCheck(text: string): ModerationResult {
  for (const { re, category, reason } of BLOCKED_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      return { allowed: false, category, reason };
    }
  }
  return { allowed: true };
}

/**
 * Guard used by the admin moderation-settings route (and by anything else
 * that ever lets an admin write free text into a prompt this file sends to
 * a model) to reject any attempt to weaken the hard-blocked categories via
 * config rather than code. Reuses BLOCKED_PATTERNS' own regexes rather than
 * a second hand-maintained list, so the two can never drift apart.
 *
 * This is defense-in-depth, not the primary control: the sync blocklistCheck()
 * above always runs before the AI call regardless of what admin-configured
 * text is in the prompt, so even a hypothetical bypass of this guard could
 * only ever affect the AI layer's judgment call, never disable the
 * synchronous hard block itself.
 */
export function containsHardBlockedLanguage(text: string): { blocked: boolean; category?: string } {
  for (const { re, category } of BLOCKED_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) return { blocked: true, category };
  }
  return { blocked: false };
}

// ── Layer 2: AI moderation (OpenRouter, via the shared provider router) ──
//
// Routed through capability.ts's generateStructured() (Phase 2 AI-wiring
// cleanup) rather than a private fetch(), so this call gets the shared
// circuit breaker, timeout policy, and provider-health tracking every other
// background subsystem already has. The model is pinned to openai/gpt-4o-mini
// on the openrouter provider specifically for the primary attempt — this is
// a safety-relevant product decision, not a wiring one, so it's never
// swapped silently on the success path. providerOverride enforces that: it
// skips Kaetah entirely rather than retrying a model string Kaetah doesn't
// recognize.
//
// MODERATION-FALLBACK FIX: a bare single pinned attempt with zero failover
// meant one model/vendor-specific outage (bad key, no account access/credit
// for that specific model, a rate limit) looked identical to "moderation is
// completely down" and fail-closed on every comment/post/reply platform-
// wide. aiModerationCheck() below retries once through OpenRouter's normal
// NANO-tier model (DeepSeek V4 Flash, already relied on everywhere else in
// this app) before giving up.
//
// PROVIDER-FAILOVER FIX (2026-09-07): the retry above only ever diversified
// the *model* — it originally still pinned `providerOverride: 'openrouter'`,
// the exact same single provider as the primary attempt, so an OpenRouter-
// wide outage (not just a gpt-4o-mini-specific one) still took down both
// attempts identically and fail-closed on every comment. The fallback call
// now omits providerOverride entirely, so it goes through the normal
// ROUTING_ORDER (openrouter  kaetah [if enabled]  openrouter-free) instead
// of retrying the provider that just failed — see that call's own comment
// below for the detail. Either way it's still a real AI verdict, never an
// auto-allow; only fails closed if every attempt across every provider
// comes back empty.

interface RawModerationResult {
  allowed:   boolean;
  category?: string;
  reason?:   string;
}

// Immutable base prompt — the Block clause here is never conditional on
// admin config. Admin-editable text (moderation_prompt_config) is appended
// AFTER this, additively, via buildModerationSystemPrompt() below, and is
// itself guarded by containsHardBlockedLanguage() at write time (see the
// admin route) so it can clarify taste-level product decisions (what
// "mature themes between adults" covers for this platform) without ever
// being able to carve an exception into the Block clause.
// OVER-BLOCK FIX (2026-09-07): "adult romance, mature themes between
// adults" was vague enough that the classifier ran conservative and
// rejected ordinary content this platform explicitly exists for —
// flirtation, explicit consensual sex scenes, kink/BDSM dynamics between
// adult characters. Spelling that out here is additive to the Allow
// clause only; the Block clause (minors, real-world harm instructions,
// hate speech, trafficking) is untouched — an explicit allow-list doesn't
// change what's still always rejected regardless of framing.
const MODERATION_SYSTEM_PROMPT_BASE = `You are a content moderator for an adult AI companion platform.
Review the text and respond ONLY with valid JSON: {"allowed": true} or {"allowed": false, "category": "...", "reason": "..."}.
Categories: minors, hate, sexual_violence, real_violence, exploitation, spam.
Allow: adult romance, flirtation, explicit consensual sex scenes between adults, kink/BDSM and power-exchange dynamics that are clearly consensual, anime, fantasy violence in fictional contexts.
Block: anything involving minors, real-world harm instructions, hate speech, trafficking, and any sexual content that is non-consensual regardless of how it's framed.`;

// ── Admin-tunable prompt config ──────────────────────────────────────────
// Same short-TTL in-memory cache pattern as keyword-watch.ts's
// loadActiveKeywords() — this runs on every moderateCharacter() call, so a
// DB round trip per call is the wrong cost for a rarely-changed setting.
const PROMPT_CONFIG_CACHE_TTL_MS = 60_000;
let cachedPromptConfig: { extraAllow: string; extraBlock: string } | null = null;
let promptConfigCachedAt = 0;

async function loadPromptConfig(): Promise<{ extraAllow: string; extraBlock: string }> {
  const now = Date.now();
  if (cachedPromptConfig && now - promptConfigCachedAt < PROMPT_CONFIG_CACHE_TTL_MS) {
    return cachedPromptConfig;
  }

  const { data, error } = await supabaseAdmin
    .from('moderation_prompt_config')
    .select('extra_allow_notes, extra_block_notes')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    // Fail closed on the CONFIG lookup means "use the immutable base
    // prompt only" — never an empty/permissive prompt. A DB hiccup here
    // should degrade to the safe default, not to no config at all.
    if (error) logger.warn('moderation: failed to load prompt config, using base prompt only', { error: String(error) });
    cachedPromptConfig = { extraAllow: '', extraBlock: '' };
    promptConfigCachedAt = now;
    return cachedPromptConfig;
  }

  cachedPromptConfig = {
    extraAllow: (data.extra_allow_notes as string) ?? '',
    extraBlock: (data.extra_block_notes as string) ?? '',
  };
  promptConfigCachedAt = now;
  return cachedPromptConfig;
}

/** Admin action — call after writing to moderation_prompt_config so a
 *  change is picked up on the next moderation call instead of waiting out
 *  the TTL. Mirrors invalidateKeywordCache(). */
export function invalidatePromptConfigCache(): void {
  cachedPromptConfig = null;
  promptConfigCachedAt = 0;
}

function buildModerationSystemPrompt(config: { extraAllow: string; extraBlock: string }): string {
  let prompt = MODERATION_SYSTEM_PROMPT_BASE;
  if (config.extraAllow.trim()) {
    prompt += `\nAdditional platform-specific allow guidance: ${config.extraAllow.trim()}`;
  }
  if (config.extraBlock.trim()) {
    prompt += `\nAdditional platform-specific block guidance: ${config.extraBlock.trim()}`;
  }
  return prompt;
}

async function aiModerationCheck(text: string): Promise<ModerationResult> {
  // Generic wording: this same check backs character bios AND single-line
  // user comments/replies (feed comments, community posts/replies all call
  // moderateCharacter — see those routes' "brought into parity" comments).
  // The old prompt hardcoded "character description", which is misleading
  // for a two-word comment and could nudge the classifier toward a reply
  // shaped like character-bio feedback instead of a clean allowed/blocked
  // verdict.
  const user = `Review this user-submitted content:\n${text.slice(0, 800)}`;
  const promptConfig = await loadPromptConfig();
  const system = buildModerationSystemPrompt(promptConfig);

  // Primary: exact-pinned model, single named provider — see the file-level
  // comment above for why the pin can't be swapped for a cheaper/default
  // model on the success path (that's a product decision about what reviews
  // content, not a wiring one).
  let parsed = await generateStructured<RawModerationResult>({
    caller: 'moderation',
    modelOverride: 'openai/gpt-4o-mini',
    providerOverride: 'openrouter',
    maxTokens: 80,
    temperature: 0,
    system,
    user,
  });

  if (!parsed) {
    // MODERATION-FALLBACK FIX: providerOverride makes routeCompletion() try
    // exactly one provider/model with no failover — by design, so a failed
    // OpenRouter call never silently retries against Kaetah with a model
    // string Kaetah doesn't understand. But that also means ANY hiccup on
    // this one pinned call — a missing/invalid key, the account lacking
    // access/credit for this specific OpenAI model on OpenRouter, a rate
    // limit, a transient 5xx — fell straight through to fail-closed below.
    // Since this same function gates every comment, post, and reply
    // platform-wide, that turned one narrow, model-specific outage into a
    // total outage of all user text submission. (Notably: every other AI
    // call site in this app uses DeepSeek/Euryale/Venice via the tier
    // ladder — 'openai/gpt-4o-mini' is used nowhere else — so a problem
    // specific to that one model/vendor pairing on the account would explain
    // comments failing 100% of the time while chat and everything else is
    // unaffected.)
    //
    // ROOT CAUSE (2026-09-07, "comment is not working"): this fallback was
    // STILL pinned to `providerOverride: 'openrouter'` — the exact same
    // single provider as the primary attempt two lines above. The
    // MODERATION-FALLBACK FIX comment above only ever diversified the
    // *model* (pinned gpt-4o-mini  default NANO-tier DeepSeek V4 Flash);
    // it never actually diversified the *provider*. So any failure mode
    // wider than "this one model is unavailable" — an invalid/revoked
    // OPENROUTER_API_KEY, the OpenRouter account suspended, a full
    // OpenRouter-side outage — takes down BOTH attempts identically, and
    // this function still fails closed on every comment/post/reply
    // platform-wide, which is exactly what the screenshot shows: a
    // brand-new feed comment ("Hello dear") rejected with this function's
    // own hard-coded fail-closed message, not a moderation *verdict*.
    //
    // Fix: drop providerOverride here so this attempt goes through
    // routeCompletion()'s normal ROUTING_ORDER (openrouter  kaetah [only
    // if KAETAH_ENABLED]  openrouter-free) instead of retrying the exact
    // provider that just failed. openrouter-free defaults to enabled
    // (OPENROUTER_FREE_FALLBACK_ENABLED, env.ts) precisely for this kind
    // of "the paid OpenRouter path is down" case, so this now gives real
    // redundancy — a second, independent shot — rather than two identical
    // attempts against one point of failure. Still a real AI judgment
    // call either way, never an auto-allow: the safety property (nothing
    // unreviewed gets through) is unchanged, this only fixes the
    // resilience gap that was collapsing to a full outage.
    logger.warn('[moderation] pinned model/provider failed, retrying on fallback tier with provider failover', {
      primaryModel: 'openai/gpt-4o-mini',
    });
    parsed = await generateStructured<RawModerationResult>({
      caller: 'moderation-fallback',
      maxTokens: 80,
      temperature: 0,
      system,
      user,
    });
  }

  if (!parsed) {
    // Fail CLOSED: holding content is safer than auto-allowing when
    // moderation is unavailable on BOTH attempts — network error, non-OK
    // status, or a reply that didn't parse as JSON all land here since
    // generateStructured() never throws, it returns null. If this is firing
    // in practice, check the "[moderation-fallback] generateStructured
    // failed" warning logged just before this for the real underlying
    // error (routeCompletion() reports the specific reason — missing key,
    // HTTP status, etc.) rather than this generic user-facing message.
    logger.error('AI moderation unavailable on pinned and fallback attempts — holding content for safety');
    return {
      allowed: false,
      category: 'moderation_unavailable',
      reason: 'Content review is temporarily unavailable. Please try again in a moment.',
    };
  }

  return { allowed: !!parsed.allowed, category: parsed.category, reason: parsed.reason };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function moderateCharacter(
  fields: {
    name:        string;
    description: string;
    personality?: string;
    backstory?:  string;
    scenario?:   string;
  },
  // Optional context for the hold-for-review queue only — omit entirely
  // for call sites that don't want hold behavior (nothing changes for
  // them; holdContext is purely additive). See keyword_watchlist.action's
  // migration comment: hold_for_review is opt-in per admin-added keyword,
  // and only ever checked here, never in the live chat reply path.
  holdContext?: { surface: string; userId: string | null },
): Promise<ModerationResult> {
  const combined = [
    fields.name,
    fields.description,
    fields.personality  ?? '',
    fields.backstory    ?? '',
    fields.scenario     ?? '',
  ].join(' ');

  const bl = blocklistCheck(combined);
  if (!bl.allowed) {
    logger.warn('Character blocked by blocklist', { category: bl.category });
    return bl;
  }

  const ai = await aiModerationCheck(combined);
  if (!ai.allowed) {
    logger.warn('Character blocked by AI moderation', { category: ai.category });
    return ai;
  }

  // Admin hold-for-review check — runs only after both hard layers already
  // passed. Log-only keyword_watch_hits behavior (action='log') is
  // untouched; this only fires for keywords an admin explicitly marked
  // 'hold_for_review'. See keyword-watch.ts's checkKeywordsForHold().
  if (holdContext) {
    const holdMatches = await checkKeywordsForHold(combined);
    if (holdMatches.length > 0) {
      const match = holdMatches[0];
      logger.warn('Content held for admin review by keyword match', {
        surface: holdContext.surface, keywordId: match.keywordId,
      });

      retry(async () => {
        const { error } = await supabaseAdmin
          .from('moderation_holds')
          .insert({
            user_id:           holdContext.userId,
            surface:           holdContext.surface,
            keyword_id:        match.keywordId,
            keyword_text:      match.keyword,
            submitted_payload: fields,
            excerpt:           match.excerpt,
          });
        if (error) throw error;
      }, 2, 250).catch(err =>
        logger.error('moderation: failed to log hold after retries', { error: String(err) }));

      return {
        allowed:  false,
        category: 'held_for_review',
        reason:   'This submission matched an admin review pattern and has been held for manual review rather than published automatically.',
      };
    }
  }

  return ai;
}
