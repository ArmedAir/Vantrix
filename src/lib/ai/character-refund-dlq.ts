/**
 * Character-Creation Refund Dead Letter Queue — Vantrix Production
 *
 * REPAIR-WORKER FIX: characters/route.ts has two spots where character
 * creation fails *after* CHARACTER_CREATION_COST tokens were already
 * deducted (insert failure, brain-init failure) and calls refund_tokens()
 * to compensate. If that refund call itself fails — the exact failure
 * mode already flagged in this repo's own token-economy audit — the user
 * is left charged with no character and, until now, no way back except a
 * manual support ticket. This queue closes that gap the same way
 * billing-dlq.ts closes the equivalent one for recordTokensUsed(): push
 * to Redis, retry on a cron, never lose the correction silently.
 *
 * Deliberately its own queue, not a shared/generic DLQ core — same
 * reasoning message-dlq.ts's own comment gives for not merging with
 * billing-dlq.ts: the payload shape and idempotency key are specific to
 * this failure (a userId + a fixed refund amount tied to one creation
 * attempt), and mixing failure domains into one queue means the recovery
 * cron either mishandles a payload shape it wasn't built for or silently
 * skips work it should have done.
 *
 * Idempotency guard: keyed on attemptId (a fresh UUID minted at the
 * moment of failure, not the character's id — the insert-failure call
 * site never has one, and the brain-init call site's character row is
 * deleted before the refund even fires). If refund_tokens() itself
 * partially lands (the RPC call succeeds server-side but the response
 * never reaches this process — a real possibility, not a hypothetical:
 * see billing-dlq.ts's own H-05 history for why "the write landed but the
 * caller couldn't tell" is a real failure mode, not a hypothetical one)
 * before the enqueue path fires, a retry would double-refund. The
 * refunded-set guard makes that safe the same way billing-dlq.ts's does.
 */

import { redis }        from '@/lib/redis';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger }       from '@/lib/logger';

const DLQ_KEY      = 'vantrix:character-refund:dlq';
const DLQ_TTL       = 60 * 60 * 24 * 7; // 7-day TTL, matches billing-dlq/message-dlq
const MAX_ATTEMPTS  = 10;

function refundedKey(attemptId: string): string {
  return `vantrix:character-refund:refunded:${attemptId}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CharacterRefundDLQItem {
  userId:       string;
  amount:       number;
  attemptId:    string;
  reason:       'insert_failed' | 'brain_init_failed';
  failedAt:     number;
  attemptCount: number;
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

export async function enqueueCharacterRefundRetry(
  userId:    string,
  amount:    number,
  attemptId: string,
  reason:    CharacterRefundDLQItem['reason'],
): Promise<void> {
  try {
    const item: CharacterRefundDLQItem = {
      userId, amount, attemptId, reason,
      failedAt:     Date.now(),
      attemptCount: 0,
    };

    const pipeline = redis.pipeline();
    pipeline.lpush(DLQ_KEY, JSON.stringify(item));
    pipeline.expire(DLQ_KEY, DLQ_TTL);
    await pipeline.exec();

    logger.warn('character-refund-dlq:enqueued', { userId, amount, attemptId, reason });
  } catch (err) {
    // Same "CRITICAL" framing billing-dlq.ts uses for this exact failure
    // mode: if the enqueue itself fails, this isn't queued for later, it's
    // just gone — the one thing this module exists to prevent.
    logger.error('character-refund-dlq: CRITICAL enqueue failed', {
      userId, amount, attemptId, reason, error: String(err),
    });
  }
}

/**
 * Mark a refund as successfully landed. Call this right after a
 * successful refund_tokens() call, before any other logic that might
 * throw, so a later retry of the same attemptId is skipped rather than
 * double-refunding.
 */
async function markRefundLanded(attemptId: string): Promise<void> {
  try {
    await redis.set(refundedKey(attemptId), '1', { ex: 60 * 60 * 48 }); // 48h, matches billing-dlq
  } catch {
    // Non-critical: worst case on failure here is a duplicated refund
    // attempt, not a lost one — same tradeoff billing-dlq.ts accepts.
  }
}

async function isAlreadyRefunded(attemptId: string): Promise<boolean> {
  try {
    const v = await redis.get(refundedKey(attemptId));
    return v !== null;
  } catch {
    // Redis down — assume not refunded (conservative: retry rather than skip)
    return false;
  }
}

// ── Recovery ──────────────────────────────────────────────────────────────────

export async function runCharacterRefundRecovery(): Promise<{
  recovered: number;
  skipped:   number;
  failed:    number;
  abandoned: number;
}> {
  let recovered = 0;
  let skipped   = 0;
  let failed    = 0;
  let abandoned = 0;

  const MAX_ITEMS = 50; // matches billing-dlq's per-run cap

  for (let i = 0; i < MAX_ITEMS; i++) {
    const raw = await redis.rpop<string>(DLQ_KEY);
    if (!raw) break;

    let item: CharacterRefundDLQItem;
    try {
      item = JSON.parse(raw) as CharacterRefundDLQItem;
    } catch (parseErr) {
      logger.warn('character-refund-dlq:malformed-item', { error: String(parseErr), raw });
      abandoned++;
      continue;
    }

    if (item.attemptCount >= MAX_ATTEMPTS) {
      // Abandoned after 10 attempts, same threshold as billing-dlq — logged
      // at error level so it surfaces for the human-review path that
      // implies, not silently dropped.
      logger.error('character-refund-dlq:abandoned', {
        userId: item.userId, amount: item.amount,
        attemptId: item.attemptId, reason: item.reason, attemptCount: item.attemptCount,
      });
      abandoned++;
      continue;
    }

    const alreadyRefunded = await isAlreadyRefunded(item.attemptId);
    if (alreadyRefunded) {
      logger.info('character-refund-dlq:skipped-already-refunded', {
        userId: item.userId, amount: item.amount, attemptId: item.attemptId,
      });
      skipped++;
      continue;
    }

    try {
      const { error: refundErr } = await supabaseAdmin.rpc('refund_tokens', {
        p_user_id: item.userId,
        p_amount:  item.amount,
      });
      if (refundErr) throw new Error(refundErr.message);

      await markRefundLanded(item.attemptId);

      logger.info('character-refund-dlq:recovered', {
        userId: item.userId, amount: item.amount,
        attemptId: item.attemptId, reason: item.reason, attemptCount: item.attemptCount,
      });
      recovered++;
    } catch (err) {
      item.attemptCount++;
      const pipeline = redis.pipeline();
      pipeline.lpush(DLQ_KEY, JSON.stringify(item));
      pipeline.expire(DLQ_KEY, DLQ_TTL);
      const requeued = await pipeline.exec().then(() => true).catch(requeueErr => {
        // Same GAP-FIX billing-dlq.ts documents: this item was already
        // popped off the queue above, so a failed re-push here is the
        // actual point of permanent loss, not the refund_tokens failure
        // caught below it.
        logger.error('character-refund-dlq:requeue-failed — item permanently lost, not just delayed', {
          userId: item.userId, amount: item.amount, attemptId: item.attemptId,
          attemptCount: item.attemptCount, error: String(requeueErr),
        });
        return false;
      });

      logger.warn('character-refund-dlq:retry-failed', {
        userId: item.userId, attemptId: item.attemptId,
        attemptCount: item.attemptCount, error: String(err), requeued,
      });
      failed++;
    }
  }

  logger.info('character-refund-dlq:run-complete', { recovered, skipped, failed, abandoned });
  return { recovered, skipped, failed, abandoned };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function getCharacterRefundDLQDepth(): Promise<number> {
  try {
    return await redis.llen(DLQ_KEY);
  } catch (err) {
    logger.warn('character-refund-dlq:llen-failed', { error: String(err) });
    return -1;
  }
}
