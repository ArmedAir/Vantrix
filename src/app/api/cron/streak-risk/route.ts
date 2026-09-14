/**
 * GET /api/cron/streak-risk — Streak Win-Back Reminder
 *
 * Runs once daily at 20:00 UTC (vercel.json cron), a few hours ahead of
 * the 00:00 UTC daily-reset that would otherwise silently break a streak
 * with no warning. Finds users who checked in yesterday but not yet
 * today and sends one reminder — see streak-risk.ts for eligibility and
 * the tone/arbitration guards it goes through before sending.
 *
 * Security: requires CRON_SECRET header, same as every other cron route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { runStreakRiskSweep } from '@/lib/notifications/streak-risk';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('STREAK_RISK');

  try {
    const result = await runStreakRiskSweep();
    logger.info('cron:streak-risk:complete', result);
    await heartbeatSuccess('STREAK_RISK');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:streak-risk:failed', { error: String(err) });
    await heartbeatFail('STREAK_RISK');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
