/**
 * AI Curator — Groq-driven final pass over the deterministic recommendation
 * shortlist. Serves both Discover ("For You" first page) and the dating deck.
 *
 * WHY IT SITS ON TOP OF THE SCORER (unchanged from v1): the formula-based
 * scorer is cheap, deterministic, personal to each user, and already narrows
 * ~150 characters to a relevant shortlist. What a formula can't do is read the
 * SHAPE of that shortlist — spot five near-identical archetypes in a row, pick
 * the best top slot for a taste profile, write a reason a human finds
 * persuasive. That is the curator's whole job: re-order and caption a
 * pre-vetted shortlist, never invent candidates.
 *
 * WHAT CHANGED IN v2 — built for scale on a free LLM tier:
 *
 *   1. Brain: calls lib/ai/groq-brain.ts (Groq gpt-oss, rate-limit governed)
 *      instead of paid OpenRouter NANO. Groq's free tier is ~1k requests/day
 *      per model; per-user calls would exhaust it in minutes at any real scale.
 *
 *   2. Taste SEGMENTS instead of per-user calls. The cache key is
 *      (surface, mood, taste-signature, shortlist-hash). Users whose top taste
 *      tags match AND who are shown the same shortlist share ONE Groq call for
 *      CURATOR_TTL. The deterministic scorer still personalises per user, so
 *      this loses little: a hit costs one Redis GET, and traffic growth makes
 *      hit-rate go UP, not the Groq bill.
 *
 *   3. Stampede lock. When a segment's cache expires under load, exactly one
 *      request calls Groq; the rest serve the deterministic order for that
 *      instant instead of piling N identical calls onto a 30 RPM limit.
 *
 * Guardrails (all preserved from v1):
 *   - Only reorders + annotates IDs it was given; the reply must be an exact
 *     permutation of the shortlist (curator-logic.ts applyCuration) or the whole
 *     result is discarded.
 *   - Every failure mode (paused, no key, budget, 429, timeout, bad JSON, bad
 *     permutation) degrades silently to the deterministic order. The AI layer
 *     can only improve the result, never break it.
 *
 * Data sent to Groq: tag names, archetypes, character names, 80-char public
 * openers, mood label. Never user ids, chat text or memories.
 */

import { z } from 'zod';
import { redis, parseRedisJson } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { env }    from '@/env';
import { brainJSON } from '@/lib/ai/groq-brain';
import {
  applyCuration, fnv1a, fromAliasResponse, hashIds, tasteSignature, topTasteTags,
  type CuratedResult, type CuratorCandidate, type CuratorLLMResponse,
} from './curator-logic';

export type { CuratedResult, CuratorCandidate } from './curator-logic';

const CURATOR_TTL      = 60 * 60 * 3; // 3h — a segment's cache is shared, so it can afford to be fresh
const LOCK_TTL         = 20;          // seconds; > Groq timeout (15s) so a live call always finishes inside its lock
const MAX_CANDIDATES   = 24;          // shortlist items sent to the LLM — keeps prompt (and TPM use) small
const MAX_TASTE_TAGS   = 8;
const DAILY_TASK_CAP   = Number(env.CURATOR_DAILY_AI_CALLS ?? 600);

export interface CuratorScope {
  /** 'discover' (Home "For You") or 'dating' (swipe deck). Segments never mix surfaces. */
  surface?: 'discover' | 'dating';
  /** Dating mood picker value, if any — changes what "best top slot" means. */
  mood?: string | null;
}

const responseSchema = z.object({
  // n = the item's position (1..N) in the shortlist shown to the model, NOT a
  // database id — see CuratorAliasResponse in curator-logic.ts for why.
  order: z.array(z.object({
    n:      z.number().int(),
    reason: z.string().optional(),
  })),
});

function segmentKey(scope: CuratorScope, tagWeights: Map<string, number>, shortlistIds: string[]): string {
  const surface = scope.surface ?? 'discover';
  const mood    = scope.mood ?? '-';
  const taste   = fnv1a(tasteSignature(tagWeights));
  return `ai-curator:v2:${surface}:${mood}:${taste}:${hashIds(shortlistIds)}`;
}

function buildPrompt(
  shortlist: CuratorCandidate[], tagWeights: Map<string, number>, scope: CuratorScope,
): { system: string; user: string } {
  const surface = scope.surface ?? 'discover';
  const tasteTags = topTasteTags(tagWeights, MAX_TASTE_TAGS);

  const system = [
    'You are a companion-recommendation curator for an AI character chat app.',
    'You will be given a shortlist of already-vetted, already-relevant characters (do not question whether they belong) and a summary of what a group of similar users enjoys.',
    'Return the shortlist reordered so the character most likely to genuinely appeal comes first.',
    'Rules for the order: (1) never place more than 2 characters of the same archetype back to back within the first 8; (2) make one of the first 6 a deliberate "something a little different" pick that sits just outside the taste summary; (3) otherwise respect the taste summary.',
    surface === 'dating'
      ? 'Reasons should read like why two people would click, e.g. "same dry sense of humor". '
      : 'Reasons should read like a friendly nudge, e.g. "matches your love of slow-burn stories". ',
    'Write one short, specific reason (under 8 words, no hashtags, no emojis, sentence case, no trailing period) for each of the first 6 only.',
    'Respond with ONLY minified JSON, no prose, no code fences, in exactly this shape:',
    '{"order":[{"n":<n>,"reason":"<reason, first 6 only>"},{"n":<n>}]}',
    'The "order" array MUST contain every n from the input exactly once — no more, no fewer, no invented ns.',
  ].join(' ');

  const user = JSON.stringify({
    surface,
    ...(scope.mood ? { mood: scope.mood } : {}),
    tasteSummary: tasteTags.length ? tasteTags : 'no strong signal yet — use broad appeal and variety',
    shortlist: shortlist.map((c, i) => ({
      n: i + 1,
      name: c.name,
      archetype: c.archetype,
      tags: (c.tags ?? []).slice(0, 5),
      opener: c.opening_line ? c.opening_line.slice(0, 80) : null,
    })),
  });

  return { system, user };
}

/**
 * Re-rank a pre-scored shortlist and attach short display reasons.
 *
 * `candidates` must already be in the deterministic scorer's order (best first)
 * — that order is both the fallback and the prior the LLM is nudging.
 *
 * `userId` is used for logging only; the cache is per taste segment, never per
 * user, and userId is never sent to Groq.
 */
export async function curateForUser(
  userId: string,
  candidates: CuratorCandidate[],
  tagWeights: Map<string, number>,
  scope: CuratorScope = {},
): Promise<CuratedResult> {
  const deterministicOrder = candidates.map(c => c.id);
  const fallback: CuratedResult = { orderedIds: deterministicOrder, reasons: new Map(), wasCurated: false };

  if (candidates.length < 3) return fallback;

  const shortlist = candidates.slice(0, MAX_CANDIDATES);
  const key = segmentKey(scope, tagWeights, shortlist.map(c => c.id));

  // 1. Segment cache hit — the common path at scale: one Redis GET, zero Groq.
  try {
    const parsed = parseRedisJson<CuratorLLMResponse>(await redis.get(key));
    if (parsed && Array.isArray(parsed.order)) {
      const hit = applyCuration(shortlist, deterministicOrder, parsed);
      if (hit) return hit;
    }
  } catch (err) {
    logger.warn('[ai-curator] cache-read-failed', { userId, error: String(err) });
  }

  // 2. Miss — only one request per segment may call Groq at a time.
  let gotLock = false;
  try {
    gotLock = (await redis.set(`${key}:lock`, '1', { nx: true, ex: LOCK_TTL })) === 'OK';
  } catch {
    return fallback; // can't coordinate → don't risk a stampede
  }
  if (!gotLock) return fallback;

  try {
    const { system, user } = buildPrompt(shortlist, tagWeights, scope);
    const out = await brainJSON({
      task:      `curator.${scope.surface ?? 'discover'}`,
      system, user,
      schema:    responseSchema,
      priority:  'interactive',
      size:      'fast',
      maxTokens: 1200,
      temperature: 0.4,
      dailyCap:  DAILY_TASK_CAP,
    });

    if (!out.ok) return fallback; // reason already counted in brain stats

    // The model answered in the short aliases it was shown; translate back to
    // real ids. Everything downstream (applyCuration, the cache) stays id-based.
    const byId = fromAliasResponse(shortlist, out.data);
    if (!byId) {
      logger.warn('[ai-curator] invalid-alias, using deterministic order', { userId, model: out.model });
      return fallback;
    }

    const curated = applyCuration(shortlist, deterministicOrder, byId);
    if (!curated) {
      logger.warn('[ai-curator] invalid-permutation, using deterministic order', { userId, model: out.model });
      return fallback;
    }

    try {
      await redis.set(key, JSON.stringify(byId), { ex: CURATOR_TTL });
    } catch (err) {
      logger.warn('[ai-curator] cache-write-failed', { userId, error: String(err) });
    }
    return curated;
  } catch (err) {
    logger.warn('[ai-curator] unexpected failure', { userId, error: String(err) });
    return fallback;
  } finally {
    redis.del(`${key}:lock`).catch(() => {});
  }
}
