/**
 * GET /api/cron/x-social-publish — X Cross-Post Publisher
 *
 * Suggested cadence: every 30 minutes. Posts queued social_posts rows to X
 * (lib/social/publisher.ts) — but only does anything at all if the
 * x_auto_publish_enabled app_config toggle is on (seeded 'false'; see
 * 20261226_x_social_publishing.sql), and stops once x_daily_post_cap is
 * reached for the UTC day. With the toggle off, this route is a harmless
 * no-op every run — queued rows just sit there for an admin to review and
 * publish manually from /admin/social.
 *
 * NOTE: registered in config/cron-jobs.mjs (id: 'x-social-publish'),
 * every 30 min — see that file for the free/pro tier scheduling mechanics.
 *
 * Security: requires CRON_SECRET header (see requireCronAuth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { acquireCronLock } from '@/lib/cron/lock';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';
import { runXPublisherCron } from '@/lib/social/publisher';
import { logger } from '@/lib/logger';
import { env } from '@/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // media upload + tweet post per row, across up to the daily cap's worth of rows

const LOCK_NAME = 'x-social-publish';
const LOCK_WINDOW_SECONDS = 30 * 60 - 60; // just under the suggested 30-minute interval

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gotLock = await acquireCronLock(LOCK_NAME, LOCK_WINDOW_SECONDS);
  if (!gotLock) {
    return NextResponse.json({ ok: true, skipped: 'locked' });
  }

  await heartbeatStart('X_SOCIAL_PUBLISH');

  try {
    const result = await runXPublisherCron();
    logger.info('cron:x-social-publish:complete', result);
    await heartbeatSuccess('X_SOCIAL_PUBLISH');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:x-social-publish:failed', { error: String(err) });
    await heartbeatFail('X_SOCIAL_PUBLISH');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
