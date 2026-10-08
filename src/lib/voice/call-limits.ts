/**
 * Voice calling — premium-only monthly minute allowance, with token
 * overage beyond it. See 20270129_voice_call_minutes.sql for the table
 * this reads/writes and the pricing reasoning in full.
 *
 * PRICING DECISION (checked against live ElevenLabs rates, not guessed):
 * published Conversational-AI/TTS rates in 2026 cluster around
 * $0.08-0.20/min depending on plan and whether LLM cost is bundled.
 * This app's own pipeline (STT free, client-side via the browser; LLM
 * cost already carried by ordinary chat; only the TTS leg is new/
 * incremental here) lands near the low end of that range, call it
 * ~$0.10-0.20/min blended.
 *
 * FREE_MINUTES_PER_MONTH = 15. Worst-case COGS exposure if every premium
 * subscriber maxed it out: 15 * ~$0.15 ≈ $2.25/mo, against a $3.99/mo
 * floor (the cheapest premium ever gets, on annual billing — see
 * tiers/config.ts's BASE_MONTHLY_PRICE/BILLING_DISCOUNT_PCT). That's a
 * thin worst-case margin on this one feature in isolation, which is
 * exactly why it's capped rather than unlimited — but real usage is
 * log-normal (most subscribers won't talk to a character for 15
 * continuous minutes every single month), so blended cost across the
 * whole premium cohort should land well under half that worst case.
 * This is a starting number, not a permanent one — intended to be
 * revisited once real usage data exists (see the TODO below).
 *
 * Beyond the free allowance: overage is billed in the app's existing VC
 * token currency (not a new one), at OVERAGE_TOKENS_PER_MINUTE. Priced
 * to carry real margin over the ~$0.15/min COGS estimate above, using
 * the same per-token value the rest of the app's token economy already
 * implies (voice/tts's own TOKEN_COST = 2 tokens per one-off voice
 * message) rather than inventing a separate scale — a continuous call
 * is a sustained stream of that same kind of audio generation, so its
 * per-minute price is set to roughly the cost of several TTS messages'
 * worth of audio per minute talked, turning heavy callers from a cost
 * risk into incremental profit instead of just capping them off.
 *
 * TODO(usage-review): once this has a few weeks of real call data,
 * revisit both constants against actual p50/p90/p99 minutes-per-user —
 * this file is the only place either number needs to change.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logger }        from '@/lib/logger';

export const FREE_MINUTES_PER_MONTH    = 15;
export const FREE_SECONDS_PER_MONTH    = FREE_MINUTES_PER_MONTH * 60;
export const OVERAGE_TOKENS_PER_MINUTE = 15;

export interface CallBalance {
  freeSecondsRemaining: number;
  freeSecondsUsed:      number;
  periodSecondsUsed:    number; // free + overage, this calendar month
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Read-only balance check — used by /api/voice/call/start to decide
 *  whether a call can begin at all (zero balance + zero spare tokens). */
export async function getCallBalance(userId: string): Promise<CallBalance> {
  const period = currentPeriod();
  const { data } = await supabaseAdmin
    .from('voice_call_usage')
    .select('free_seconds_used, overage_seconds')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();

  const freeUsed = data?.free_seconds_used ?? 0;
  const overage  = data?.overage_seconds ?? 0;
  return {
    freeSecondsRemaining: Math.max(0, FREE_SECONDS_PER_MONTH - freeUsed),
    freeSecondsUsed:      freeUsed,
    periodSecondsUsed:    freeUsed + overage,
  };
}

export interface RecordCallSecondsResult {
  balance: CallBalance;
  /** true once this call's elapsed time has eaten the free allowance and
   *  started drawing on overage minutes (informational — the call isn't
   *  stopped for this alone, only for insufficientTokens below). */
  enteredOverage: boolean;
  /** true if overage tokens couldn't be charged (wallet ran out
   *  mid-call) — the caller (the call-usage route) should end the call
   *  rather than let unpaid-for seconds accumulate silently. */
  insufficientTokens: boolean;
}

/**
 * Records `seconds` of call time just elapsed, consuming free allowance
 * first and billing any remainder as token overage. Called periodically
 * during an active call (see POST /api/voice/call/usage) rather than
 * once at the end, so a dropped connection or a crashed tab still bills
 * for time actually used instead of losing the whole call's usage.
 *
 * Token charging uses the same atomic deduct_tokens RPC voice/tts/route.ts
 * already uses for one-off voice messages — same race-safety, same
 * insufficient-balance behavior (rejects rather than overdrawing).
 */
export async function recordCallSeconds(userId: string, seconds: number): Promise<RecordCallSecondsResult> {
  if (seconds <= 0) {
    return { balance: await getCallBalance(userId), enteredOverage: false, insufficientTokens: false };
  }

  const period = currentPeriod();
  const { data: existingRow } = await supabaseAdmin
    .from('voice_call_usage')
    .select('free_seconds_used, overage_seconds, overage_tokens_charged')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();
  const existingFreeUsed       = existingRow?.free_seconds_used ?? 0;
  const existingOverage        = existingRow?.overage_seconds ?? 0;
  const existingTokensCharged  = existingRow?.overage_tokens_charged ?? 0;
  const freeSecondsRemaining = Math.max(0, FREE_SECONDS_PER_MONTH - existingFreeUsed);

  const freeSecondsThisTick    = Math.min(seconds, freeSecondsRemaining);
  const overageSecondsThisTick = seconds - freeSecondsThisTick;

  // Overage is billed in whole minutes (rounded up) so a user is never
  // charged a fractional token for a few leftover seconds — the last
  // partial minute of a call rounds up to one full minute's token cost,
  // same "round up" posture as telecom per-minute billing generally.
  let insufficientTokens = false;
  let tokensCharged = 0;
  if (overageSecondsThisTick > 0) {
    const overageMinutes = Math.ceil(overageSecondsThisTick / 60);
    tokensCharged = overageMinutes * OVERAGE_TOKENS_PER_MINUTE;
    try {
      await supabaseAdmin.rpc('deduct_tokens', {
        p_user_id: userId, p_amount: tokensCharged, p_reason: 'voice_call_overage',
      });
    } catch (err) {
      insufficientTokens = true;
      tokensCharged = 0; // nothing charged — don't record overage seconds we didn't bill for
      logger.warn('voice-call: overage token charge failed, ending call', {
        userId, overageSecondsThisTick, error: String(err),
      });
    }
  }

  const billedOverageSeconds = insufficientTokens ? 0 : overageSecondsThisTick;

  const { error } = await supabaseAdmin
    .from('voice_call_usage')
    .upsert({
      user_id: userId,
      period,
      free_seconds_used:      existingFreeUsed + freeSecondsThisTick,
      overage_seconds:        existingOverage + billedOverageSeconds,
      overage_tokens_charged: existingTokensCharged + tokensCharged, // cumulative for the month — audit/support value, not re-debited from here
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,period' });

  if (error) {
    logger.error('voice-call: usage upsert failed', { userId, error: error.message });
  }

  return {
    balance: await getCallBalance(userId),
    enteredOverage: overageSecondsThisTick > 0,
    insufficientTokens,
  };
}
