/**
 * GET /api/cron/age-reverification-tick
 *
 * Runs daily. Flips 'verified' age-verification rows to 'pending' once
 * AGE_VERIFICATION_VALIDITY_MONTHS (age-gate.ts) has passed since
 * verified_at, via reverifyExpiredAgeVerifications().
 *
 * Not to be confused with /api/cron/aging-tick, which increments a
 * fictional character's stated age — an unrelated system. This cron only
 * ever touches real users' compliance verification status.
 *
 * Note: is_user_age_verified() (SQL) already checks expires_at live on
 * every call, so this tick is bookkeeping, not the actual access gate —
 * see the doc comment on reverifyExpiredAgeVerifications() for why.
 *
 * Security: requires CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { reverifyExpiredAgeVerifications } from '@/lib/age-verification/age-gate';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('AGE_REVERIFICATION_TICK');

  try {
    const result = await reverifyExpiredAgeVerifications();
    logger.info('cron:age-reverification-tick:complete', result);
    await heartbeatSuccess('AGE_REVERIFICATION_TICK');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:age-reverification-tick:failed', { error: String(err) });
    await heartbeatFail('AGE_REVERIFICATION_TICK');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
