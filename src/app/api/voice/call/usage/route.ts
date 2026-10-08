/**
 * POST /api/voice/call/usage — records elapsed call time, consuming the
 * monthly free allowance first and billing any remainder in VC tokens.
 *
 * Called periodically by the active call UI (every ~20s — see
 * use-voice-call.ts) rather than once when the call ends, so a dropped
 * connection, a crashed tab, or the user just closing the browser mid-
 * call still bills for time actually used instead of the whole call's
 * usage being lost (and the free allowance effectively regenerating for
 * free). Also called once more on explicit call-end with whatever
 * partial tick remains.
 *
 * Deliberately NOT gated behind requirePlan here the way
 * /api/voice/call/start is — by the time a usage tick is being reported,
 * the call already legitimately started under that gate; re-checking
 * plan on every 20s tick would only punish a subscription that lapsed
 * mid-call by refusing to bill for (and thus silently eating the cost
 * of) time already spent. insufficientTokens from recordCallSeconds is
 * the actual stop signal this route relies on instead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { recordCallSeconds } from '@/lib/voice/call-limits';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  // Capped at 120s — this is a periodic tick, not an end-of-call lump
  // sum; a client reporting more than ~2 ticks' worth at once is either
  // misbehaving or trying to under-report ticks to delay overage
  // billing, neither of which should be trusted at face value.
  seconds: z.number().min(0).max(120),
});

export async function POST(req: NextRequest) {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  try {
    const result = await recordCallSeconds(user.id, parsed.data.seconds);
    return NextResponse.json({
      freeSecondsRemaining: result.balance.freeSecondsRemaining,
      enteredOverage:       result.enteredOverage,
      insufficientTokens:   result.insufficientTokens,
      ...(result.insufficientTokens ? { code: 'CALL_LIMIT_EXCEEDED' } : {}),
    }, { status: result.insufficientTokens ? 402 : 200 });
  } catch (err) {
    logger.error('voice/call/usage: unexpected error', {
      userId: user.id, error: err instanceof Error ? err.message : String(err),
    });
    // Fail open — a usage-recording hiccup shouldn't itself drop the
    // call; worst case this tick's seconds aren't billed, which is a
    // cost-side risk, not a user-facing break.
    return NextResponse.json({ freeSecondsRemaining: null, enteredOverage: false, insufficientTokens: false });
  }
}
