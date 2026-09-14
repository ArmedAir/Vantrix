/**
 * GET /api/cron/character-refund-recovery — DLQ Character-Refund Recovery
 *
 * Runs every 5 minutes, same cadence as billing-recovery and
 * message-recovery. Pops items from the character-creation refund dead
 * letter queue and re-attempts the refund_tokens() call in Supabase.
 *
 * This closes the gap flagged in this repo's own token-economy audit:
 * character creation fails after the charge lands, the compensating
 * refund is attempted, and — until this queue existed — a failure of
 * that refund itself was just a logged error with no automated way back.
 * Now every failed refund eventually lands or is escalated for human
 * review (see character-refund-dlq.ts's abandonment threshold), the same
 * "zero silent loss" guarantee billing-recovery already gives token
 * deductions.
 *
 * Security: requires CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth }             from '@/lib/security';
import { runCharacterRefundRecovery }  from '@/lib/ai/character-refund-dlq';
import { logger }                    from '@/lib/logger';
import { env }                       from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('CHARACTER_REFUND_RECOVERY');

  try {
    const result = await runCharacterRefundRecovery();
    logger.info('cron:character-refund-recovery:complete', result);
    await heartbeatSuccess('CHARACTER_REFUND_RECOVERY');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:character-refund-recovery:failed', { error: String(err) });
    await heartbeatFail('CHARACTER_REFUND_RECOVERY');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
