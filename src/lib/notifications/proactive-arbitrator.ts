/**
 * Proactive Arbitrator — Vantrix
 *
 * character-initiative.ts, nudge.ts, surprise-engine.ts, and
 * streak-risk.ts each decide independently whether to push something at
 * a given user, and each self-caps against ITS OWN history only:
 *
 *   - character-initiative.ts: skips only if that user+character pair
 *     already has an undelivered initiative queued (character_initiatives
 *     table)
 *   - nudge.ts:                MAX_NUDGES_PER_USER_PER_DAY, tracked in its
 *     own Redis key (vantrix:nudge:daily:*)
 *   - surprise-engine.ts:      canSendSurprise() per-pair cooldown, no
 *     cross-user daily cap at all
 *   - streak-risk.ts:          naturally at most once/day (the eligibility
 *     window it queries only exists once per user per UTC day), but still
 *     has no idea whether the other three already used today's attention
 *
 * None of the four checks the others. A user can get a character
 * initiative, a nudge, a surprise, AND a streak-risk reminder the same
 * day — four unrelated pushes stacking with no coordination, which reads
 * as spammy regardless of how well-reasoned each individual system's own
 * cap is.
 *
 * This module is the shared gate all four should call (in addition to,
 * not instead of, their own existing checks — those stay as the
 * per-source cooldowns; this is the cross-source ceiling on top).
 *
 * Two rules, both per userId (not per user+character — the whole point
 * is these compete for the same person's attention regardless of which
 * companion or which system sent them):
 *
 *   1. Daily ceiling — at most MAX_PROACTIVE_PER_USER_PER_DAY proactive
 *      pushes from ANY combination of sources, per UTC calendar day.
 *   2. Quiet gap — at least MIN_GAP_HOURS between any two proactive
 *      pushes, regardless of source, so pushes still don't land back-
 *      to-back even on a day well under the daily ceiling.
 *
 * Priority order (highest wins when a caller wants to know which source
 * "should" get today's remaining slot(s) — not currently enforced by
 * reserveProactiveSlot itself, which is pure first-claim-wins since all
 * four crons already run at fixed, staggered offsets; exposed as
 * PROACTIVE_SOURCE_PRIORITY for a future scheduler that wants to decide
 * ahead of time rather than race):
 *
 *   character_initiative > streak_risk > surprise > nudge
 *
 * (initiative is the most personal/character-voiced; streak_risk is the
 * most time-boxed — it's wrong or stale outside its ~4h send window in a
 * way the others aren't — and carries the account's own progress, not a
 * character's; surprise is calendar-driven and rare by construction;
 * nudge is the most generic of the four, so it's the one that should
 * yield first.)
 *
 * Fails open on any Redis error — same posture as every cap check
 * already in this codebase (nudge.ts's isUserAtDailyCap, etc.). A
 * throttling feature must never be the reason a real push silently
 * never arrives; worst case on a Redis outage is the old
 * every-source-for-itself behavior, not zero pushes.
 */

import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

export type ProactiveSource = 'character_initiative' | 'nudge' | 'surprise' | 'streak_risk';

export const PROACTIVE_SOURCE_PRIORITY: ProactiveSource[] = [
  'character_initiative', 'streak_risk', 'surprise', 'nudge',
];

const MAX_PROACTIVE_PER_USER_PER_DAY = 3;
const MIN_GAP_HOURS                  = 4;
const DAILY_KEY_TTL_SECONDS          = 26 * 60 * 60; // a little over 24h, covers TZ slop

function dailyKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `vantrix:proactive:daily:${userId}:${day}`;
}

function gapKey(userId: string): string {
  return `vantrix:proactive:lastsent:${userId}`;
}

/**
 * Claim a slot to push proactive content at this user, or find out
 * someone else already has today's attention. Call this AFTER a
 * source's own per-source checks pass (it's the last gate before
 * actually writing/delivering, not a replacement for e.g. nudge.ts's
 * per-match cooldown) and only actually record/deliver if this returns
 * true.
 *
 * Atomic enough for this use case: the quiet-gap check uses SET…NX so
 * two sources racing within the same millisecond can't both win it, and
 * the daily count uses INCR (also atomic) checked against the ceiling
 * after incrementing — a source that loses the race gets its increment
 * "wasted" but never exceeds the ceiling, which is the side the
 * failure mode should fall on.
 */
export async function reserveProactiveSlot(params: {
  userId:   string;
  source:   ProactiveSource;
}): Promise<boolean> {
  const { userId, source } = params;

  try {
    // Quiet gap first — cheaper to reject here than to also spend a
    // daily-count increment on a push that's going to be denied anyway.
    const claimedGap = await redis.set(gapKey(userId), source, {
      nx: true,
      ex: MIN_GAP_HOURS * 60 * 60,
    });
    if (!claimedGap) {
      logger.info('proactive-arbitrator:denied-gap', { userId, source });
      return false;
    }

    const key   = dailyKey(userId);
    const pipe  = redis.pipeline();
    pipe.incr(key);
    pipe.expire(key, DAILY_KEY_TTL_SECONDS);
    const results = await pipe.exec();
    const count   = (results[0] as number) ?? 0;

    if (count > MAX_PROACTIVE_PER_USER_PER_DAY) {
      logger.info('proactive-arbitrator:denied-daily-cap', { userId, source, count });
      // Release the gap claim we just took — this push isn't happening,
      // so it shouldn't block a different source's push later today.
      await redis.del(gapKey(userId)).catch(() => {});
      return false;
    }

    return true;
  } catch (err) {
    logger.warn('proactive-arbitrator:failed-open', { userId, source, error: String(err) });
    return true;
  }
}
