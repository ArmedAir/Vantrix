/**
 * GET /api/cron/homepage-rotation — Groq-driven homepage hero rotation.
 *
 * Runs every 2 hours. Behaviour depends on HOMEPAGE_ROTATION_MODE
 * (off | shadow | live — default shadow, which logs decisions to
 * ai_brain_decisions and changes nothing on the site). See
 * lib/curator/homepage-rotation.ts for the full contract.
 *
 * Security: requires CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth }           from '@/lib/security';
import { runHomepageRotation }       from '@/lib/curator/homepage-rotation';
import { logger }                    from '@/lib/logger';
import { env }                       from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('HOMEPAGE_ROTATION');

  try {
    const result = await runHomepageRotation();
    logger.info('cron:homepage-rotation:complete', { ...result });
    // 'failed' = the decision was made but writing it to the DB failed.
    if (result.status === 'failed') {
      await heartbeatFail('HOMEPAGE_ROTATION');
      return NextResponse.json({ ok: false, ...result, timestamp: new Date().toISOString() }, { status: 500 });
    }
    await heartbeatSuccess('HOMEPAGE_ROTATION');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:homepage-rotation:failed', { error: String(err) });
    await heartbeatFail('HOMEPAGE_ROTATION');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
