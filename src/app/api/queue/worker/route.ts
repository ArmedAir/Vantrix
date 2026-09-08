/**
 * GET /api/queue/worker
 *
 * Worker trigger endpoint — called every minute by Vercel Cron, or on-demand
 * by external schedulers / the standalone worker-runner process.
 *
 * Auth (dual-mode):
 *   • Vercel Cron injects:  Authorization: Bearer {CRON_SECRET}
 *   • Manual/standalone:    x-worker-secret: {WORKER_SECRET}
 *   requireCronAuth() handles both patterns with timing-safe comparison.
 *
 * Throughput:
 *   Each wave of BATCH_SIZE jobs is processed in parallel
 *   (Promise.allSettled). SCALE-FIX (2026-09-04): a single wave used to be
 *   the whole invocation, capping this route at BATCH_SIZE jobs per trigger
 *   — a hard ~300 jobs/hour platform-wide ceiling on Vercel's native
 *   1×/min cron, and far worse (BATCH_SIZE per 5 minutes, since GitHub
 *   Actions cannot schedule sub-5-minute cron — see
 *   config/cron-jobs.mjs's githubActionsSchedule()) on CRON_TIER=free,
 *   where this route is only triggered via the GH Actions fallback.
 *   config/cron-jobs.mjs's own comment on githubActionsSchedule() already
 *   pointed at the fix ("A job clamped here needs its route to compensate
 *   for the lower trigger frequency itself — see /api/queue/worker's
 *   internal drain loop") — that loop didn't actually exist yet. It does
 *   now: this route keeps pulling waves until either the queue drains or
 *   FUNCTION_BUDGET_MS is spent, so one invocation does as much work as
 *   the platform's real per-invocation duration ceiling allows, regardless
 *   of how infrequently something remembers to trigger it.
 *   A distributed Redis lock still prevents double-invocation from cron
 *   failover.
 */

import { NextRequest, NextResponse }  from 'next/server';
import { processNextJob }              from '@/lib/queue/worker';
import { getQueueDepths }              from '@/lib/queue';
import { checkAndSignalScaleOut }      from '@/lib/queue/scaler';
import { logger }                      from '@/lib/logger';
import { requireCronAuth, timingSafeEqual } from '@/lib/security';
import { env }                         from '@/env';
import { redis }              from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_SIZE = env.WORKER_BATCH_SIZE;

// This route's real maxDuration is declared in config/cron-jobs.mjs
// ('queue-worker', 60s) and applied to vercel.json's generated `functions`
// block — it isn't set tier-by-tier for this job (unlike content-engine
// etc.), so 60s is the real ceiling on both free and pro. Budget under
// that, not up to it, so there's always time left to write the response
// and release the lock cleanly instead of getting killed mid-drain.
const FUNCTION_BUDGET_MS = 55_000;

// Sanity bound on wave count — FUNCTION_BUDGET_MS is the real stopping
// condition; this only guards against an unexpectedly fast job loop
// spinning far more waves than intended if timing assumptions are ever
// wrong.
const MAX_WAVES = 200;

export async function GET(req: NextRequest) {
  // ── Auth — accept Vercel Cron OR manual worker secret ────────────────────
  // Vercel Cron: Authorization: Bearer {CRON_SECRET}
  // Manual:      x-worker-secret: {WORKER_SECRET}
  const isValidCron   = requireCronAuth(req, env.CRON_SECRET);
  const xWorkerHeader = req.headers.get('x-worker-secret');
  const isValidWorker = xWorkerHeader
    ? timingSafeEqual(xWorkerHeader, env.WORKER_SECRET)
    : false;

  if (!isValidCron && !isValidWorker) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Distributed lock — prevents double-invocation from cron failover ─────
  // Window: 1 minute (matches Vercel Cron schedule). TTL: 90s gives a full
  // invocation window plus buffer before the next cron fires.
  const workerLockKey = `vantrix:worker:lock:${Math.floor(Date.now() / 60_000)}`;
  const acquired = await redis.set(workerLockKey, '1', { nx: true, ex: 90 });
  if (!acquired) {
    return NextResponse.json({
      skipped:   true,
      reason:    'another worker instance is running this minute',
      remaining: await getQueueDepths(),
      ts:        new Date().toISOString(),
    });
  }

  // ── Parallel job processing, looped until drained or budget spent ────────
  // Each wave: BATCH_SIZE jobs start concurrently (Promise.allSettled).
  // Each job is independent with its own Redis lock, so parallel execution
  // within a wave is safe. Waves repeat back-to-back until either the
  // queue is empty or FUNCTION_BUDGET_MS has elapsed — see header comment
  // for why this loop needs to exist at all.
  const startedAt = Date.now();
  let jobsRun     = 0;
  let jobsFailed  = 0;
  let waves       = 0;

  try {
    while (Date.now() - startedAt < FUNCTION_BUDGET_MS && waves < MAX_WAVES) {
      waves++;
      const results = await Promise.allSettled(
        Array.from({ length: BATCH_SIZE }, () => processNextJob()),
      );

      // A wave "did something" only if at least one call actually
      // dequeued a job (returned true). If every call came back false
      // (queue empty) or rejected (e.g. a Redis hiccup), there's nothing
      // more to drain right now — stop instead of busy-looping for the
      // rest of the budget.
      let progressed = false;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value) { jobsRun++; progressed = true; }
        } else {
          jobsFailed++;
          logger.error('Worker job threw', {
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      }
      if (!progressed) break;
    }
  } catch (err: unknown) {
    logger.error('Worker batch fatal', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const depths  = await getQueueDepths();
  const elapsed = Date.now() - startedAt;

  // SCALE-FIX (2026-09-04): previously only called from the standalone
  // worker-runner.ts, which doesn't run at all on a Vercel-only deployment
  // (see docker-compose.yml's own header comment) — meaning the scale-out
  // signal was never computed on the platform's default deployment target.
  // Checking here too means it fires regardless of which trigger path is
  // actually in use.
  await checkAndSignalScaleOut(depths.high + depths.normal + depths.low).catch(() => {});

  logger.info('worker:batch-complete', {
    processed: jobsRun,
    failed:    jobsFailed,
    waves,
    elapsed_ms: elapsed,
    remaining: depths,
  });

  return NextResponse.json({
    processed: jobsRun,
    failed:    jobsFailed,
    waves,
    remaining: depths,
    elapsed_ms: elapsed,
    ts:        new Date().toISOString(),
  });
}
