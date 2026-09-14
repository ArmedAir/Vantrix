/**
 * GET /api/cron/x-social-select — X Cross-Post Auto-Select
 *
 * Suggested cadence: every 2 hours. Scans recent character_posts for
 * cross-postable candidates (see lib/social/eligibility.ts) and queues them
 * as social_posts rows in status='queued' (lib/social/auto-select.ts).
 * Queuing a row here does NOT post it — see x-social-publish for that, which
 * is gated separately by the x_auto_publish_enabled app_config toggle.
 *
 * NOTE: registered in config/cron-jobs.mjs (id: 'x-social-select'),
 * every 2h — see that file for the free/pro tier scheduling mechanics.
 *
 * Security: requires CRON_SECRET header (see requireCronAuth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { acquireCronLock } from '@/lib/cron/lock';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';
import { runXAutoSelect } from '@/lib/social/auto-select';
import { logger } from '@/lib/logger';
import { env } from '@/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCK_NAME = 'x-social-select';
const LOCK_WINDOW_SECONDS = 2 * 60 * 60 - 60; // just under the suggested 2h interval

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gotLock = await acquireCronLock(LOCK_NAME, LOCK_WINDOW_SECONDS);
  if (!gotLock) {
    return NextResponse.json({ ok: true, skipped: 'locked' });
  }

  await heartbeatStart('X_SOCIAL_SELECT');

  try {
    const result = await runXAutoSelect();
    logger.info('cron:x-social-select:complete', result);
    await heartbeatSuccess('X_SOCIAL_SELECT');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:x-social-select:failed', { error: String(err) });
    await heartbeatFail('X_SOCIAL_SELECT');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
