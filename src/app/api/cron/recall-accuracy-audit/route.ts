/**
 * GET /api/cron/recall-accuracy-audit
 *
 * Judge-grades a sample of memory_recall_audit rows (written fire-and-forget
 * by src/lib/ai/memory-recall-audit.ts, right after each assistant reply
 * that had memory context injected) — see memory-recall-grader.ts for the
 * actual grading logic. This is the read/verification side of the loop;
 * embedding-backfill is the write-side catch-up job it deliberately runs
 * after (30 3 vs 0 4 UTC — see config/cron-jobs.mjs), so a memory that only
 * just got backfilled an embedding has a full day of normal traffic before
 * it could plausibly show up as a grading subject here (grading reads
 * memory_graph rows directly by id, not through the embedding path, so
 * this ordering isn't a hard dependency — just keeps the two "memory
 * system health" jobs from competing for OpenRouter/brain-service capacity
 * in the same window).
 *
 * Same batching-loop shape as embedding-backfill/route.ts: a time budget,
 * not a fixed iteration count, since gradeRecallBatch()'s real duration
 * depends on the judge model's live latency, not a number guessed here.
 * Stops immediately once a batch reports sampled: 0 (caught up — no
 * pending rows left).
 *
 * Security: requires CRON_SECRET header, same as every other cron route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth }           from '@/lib/security';
import { logger }                    from '@/lib/logger';
import { env }                       from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';
import { gradeRecallBatch, type GradeBatchResult } from '@/lib/ai/memory-recall-grader';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 25; // one judge call per row — kept smaller than embedding-backfill's 50-row /embed batches, which are a single request regardless of size
// Comfortable margin under maxDuration=60s, same reasoning as
// embedding-backfill's SOFT_BUDGET_MS: leaves room for the slowest
// in-flight judge call (bounded by GRADER_TIMEOUT_MS) to finish cleanly
// before Vercel would kill the invocation mid-batch.
const SOFT_BUDGET_MS = 45_000;
// Belt-and-suspenders cap alongside the time budget — 20 batches x 25 rows
// = up to 500 rows/run, comfortably above the steady daily sample volume
// this cron exists for, without risking an unbounded run against a large
// backlog (e.g. after this feature first ships and there's a multi-day
// accumulation of unsampled turns).
const MAX_ITERATIONS = 20;

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('RECALL_ACCURACY_AUDIT');
  const startedAt = Date.now();

  const totals: GradeBatchResult = { sampled: 0, graded: 0, skipped: 0, contradicted: 0 };
  let iterations = 0;

  try {
    while (iterations < MAX_ITERATIONS) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) {
        logger.info('cron:recall-accuracy-audit:time-budget-reached', { totals, iterations });
        break;
      }

      const batch = await gradeRecallBatch(BATCH_SIZE);
      // Same ordering-of-operations note as embedding-backfill's
      // runBackfillLoop: increment immediately, before either exit check,
      // so this always equals the real number of gradeRecallBatch() calls
      // made — `processed: 0`/`sampled: 0` is the normal "caught up" exit,
      // not a rare one, so a `for` loop's post-break increment skip would
      // undercount on most runs, not just edge cases.
      iterations++;
      totals.sampled      += batch.sampled;
      totals.graded        += batch.graded;
      totals.skipped        += batch.skipped;
      totals.contradicted += batch.contradicted;

      if (batch.sampled === 0) break; // caught up — nothing left with grading_status = 'pending'
    }

    logger.info('cron:recall-accuracy-audit:complete', { totals, iterations });
    if (totals.contradicted > 0) {
      // Worth a distinct log line beyond the aggregate — an admin grepping
      // for this run's health shouldn't have to parse the JSON blob above
      // to notice contradictions actually happened this run.
      logger.warn('cron:recall-accuracy-audit:contradictions-found', {
        contradicted: totals.contradicted, sampled: totals.sampled,
      });
    }

    await heartbeatSuccess('RECALL_ACCURACY_AUDIT');
    return NextResponse.json({
      ok: true,
      ...totals,
      iterations,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('cron:recall-accuracy-audit:failed', { error: String(err), totals, iterations });
    await heartbeatFail('RECALL_ACCURACY_AUDIT');
    return NextResponse.json({ ok: false, error: String(err), ...totals }, { status: 500 });
  }
}
