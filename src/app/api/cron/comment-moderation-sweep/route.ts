/**
 * GET /api/cron/comment-moderation-sweep — Stale-Pending Comment Reconciler
 *
 * Backstop for runAsyncCommentReview() (see @/lib/moderation and
 * 20260909_async_comment_moderation.sql): that function only ever fires
 * once, from an after() background task on the original comment POST. If
 * the function instance is killed or times out before after() completes,
 * the comment is left 'pending' forever with nothing left to revisit it —
 * a silent gap distinct from "AI unavailable" (which does queue a hold).
 *
 * Runs every 5 minutes, same cadence as memory-tier-consolidation; each
 * tick re-reviews any comment still 'pending' past a 10-minute grace
 * window via sweepStalePendingComments(), which is idempotent — a comment
 * that gets a real verdict this run is no longer 'pending' next run.
 *
 * Security: requires CRON_SECRET header, same as every other cron route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { sweepStalePendingComments } from '@/lib/moderation';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('COMMENT_MODERATION_SWEEP');

  try {
    const result = await sweepStalePendingComments();
    logger.info('cron:comment-moderation-sweep:complete', { ...result });
    await heartbeatSuccess('COMMENT_MODERATION_SWEEP');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:comment-moderation-sweep:failed', { error: String(err) });
    await heartbeatFail('COMMENT_MODERATION_SWEEP');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
