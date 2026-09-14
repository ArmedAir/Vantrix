/**
 * GET /api/cron/canon-backfill — Canon Image-Set Recovery
 *
 * Runs periodically (recommend every 6h — same cadence as animate-backfill,
 * which this mirrors). Finds every character whose LoRA training completed
 * but whose 50-image canon set never actually landed, and re-triggers it.
 *
 * P0 GAP THIS CLOSES (external audit, 2026-09-06): the ONLY place the canon
 * set is ever triggered is /api/webhooks/fal-lora — inside an after()
 * callback, fired once, fire-and-forget, right after the webhook's
 * idempotency key is already recorded. If that after() callback never
 * completes (function frozen/recycled mid-run, an unhandled throw before
 * runCanonImageSetForCharacter's own try/catch can record failure, etc.),
 * there is no other trigger anywhere in the app that will ever attempt it
 * again — and fal.ai won't retry the webhook delivery either, since the
 * webhook itself already returned 200. A character can therefore sit
 * forever with lora_training_status='completed' and canon_set_status
 * stuck at null/'generating'/'failed', with nothing surfacing that beyond
 * a log line at the time. This cron is the recovery path, following the
 * exact same batched/rate-limited/stale-processing-sweep shape
 * animate-backfill already established for the identical class of problem
 * on the video side.
 *
 * Security: requires CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runCanonImageSetForCharacter } from '@/lib/fal/lora-pipeline';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 280; // each backfilled character re-runs the full 50-image/5-batch pipeline

// Cap per run — a canon set is already ~50 billable image generations on its
// own, run sequentially per character (not fired concurrently) to avoid
// spiking fal.ai concurrency/rate limits and to keep this run's total time
// bounded and predictable; a large backlog drains gradually across
// subsequent runs rather than all at once.
const BATCH_SIZE = 2;

// Matches train-lora/route.ts's and fal-lora/route.ts's own local slugify()
// exactly — all three need the identical derivation or a character's R2
// assets end up split across two slugs.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'character';
}

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('CANON_BACKFILL');

  // CRON_TIER guard: this route's real budget (up to ~280s — each
  // candidate is a full sequential 50-image canon run) doesn't fit Vercel
  // Hobby's 60s hard ceiling, same category as content-engine-video (see
  // that route's header comment for the full reasoning, incl. why this
  // can't rely solely on config/cron-jobs.mjs's fitsFreeTier() keeping it
  // out of the schedule — requireCronAuth() only checks the secret, not
  // the caller, so a manual curl or a stale pinger could still reach this
  // directly on a free-tier deploy and get killed mid-run for nothing).
  if (env.CRON_TIER === 'free') {
    logger.warn(
      "cron:canon-backfill skipped — CRON_TIER=free cannot fit this job's ~280s budget inside Vercel Hobby's 60s ceiling; set CRON_TIER=pro once on Vercel Pro to enable",
    );
    await heartbeatSuccess('CANON_BACKFILL');
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason:
        "CRON_TIER=free — canon backfill needs up to ~280s and Vercel Hobby hard-caps invocations at 60s. Upgrade to Vercel Pro and set CRON_TIER=pro to enable this job.",
    });
  }

  try {
    // Never attempted, or a prior attempt's own catch handler recorded
    // failure cleanly — both safe to retry, same reasoning as
    // animate-backfill's 'pending'/'failed' branch. `is(...)` because
    // canon_set_status has no non-null default; a LoRA-trained character
    // that predates this feature (or hit the exact crash this cron exists
    // for) never got the column set at all.
    const STALE_GENERATING_HOURS = 2;
    const staleCutoff = new Date(Date.now() - STALE_GENERATING_HOURS * 60 * 60 * 1000).toISOString();

    const [{ data: neverStarted, error: neverErr }, { data: failedRuns, error: failedErr }, { data: stuckRuns, error: stuckErr }] =
      await Promise.all([
        supabaseAdmin
          .from('characters')
          .select('id, name, face_prompt, lora_model_id, canon_set_status')
          .eq('lora_training_status', 'completed')
          .is('canon_set_status', null)
          .not('lora_model_id', 'is', null)
          .not('face_prompt', 'is', null)
          .eq('active', true)
          .limit(BATCH_SIZE),
        supabaseAdmin
          .from('characters')
          .select('id, name, face_prompt, lora_model_id, canon_set_status')
          .eq('lora_training_status', 'completed')
          .eq('canon_set_status', 'failed')
          .not('lora_model_id', 'is', null)
          .not('face_prompt', 'is', null)
          .eq('active', true)
          .limit(BATCH_SIZE),
        // The after() callback died mid-run and never reached its own
        // catch — canon_set_status is still 'generating' well past any
        // realistic completion time (50 images in batches of 5 with 1s
        // pauses is minutes, not hours).
        supabaseAdmin
          .from('characters')
          .select('id, name, face_prompt, lora_model_id, canon_set_status')
          .eq('lora_training_status', 'completed')
          .eq('canon_set_status', 'generating')
          .lt('updated_at', staleCutoff)
          .not('lora_model_id', 'is', null)
          .not('face_prompt', 'is', null)
          .eq('active', true)
          .limit(BATCH_SIZE),
      ]);

    if (neverErr) throw new Error(`never-started query failed: ${neverErr.message}`);
    if (failedErr) throw new Error(`failed-runs query failed: ${failedErr.message}`);
    if (stuckErr) throw new Error(`stuck-runs query failed: ${stuckErr.message}`);

    type Candidate = { id: string; name: string; face_prompt: string | null; lora_model_id: string | null };
    const rows: Candidate[] = [...(neverStarted ?? []), ...(failedRuns ?? []), ...(stuckRuns ?? [])]
      // Belt-and-suspenders: the query filters already require these
      // non-null, but an empty string would slip past `.not(is null)` the
      // same way animate-backfill's image_url gap did — guard here too.
      .filter(r => typeof r.face_prompt === 'string' && r.face_prompt.trim().length > 0
                && typeof r.lora_model_id === 'string' && r.lora_model_id.trim().length > 0)
      .slice(0, BATCH_SIZE);

    if (rows.length === 0) {
      logger.info('cron:canon-backfill:complete', { submitted: 0 });
      await heartbeatSuccess('CANON_BACKFILL');
      return NextResponse.json({ ok: true, submitted: 0, timestamp: new Date().toISOString() });
    }

    // Mark 'generating' up front so an overlapping run can't double-submit
    // the same character — mirrors runCanonImageSetForCharacter's own first
    // write, and animate-backfill's identical up-front claim.
    await supabaseAdmin
      .from('characters')
      .update({ canon_set_status: 'generating', canon_set_error: null })
      .in('id', rows.map(r => r.id));

    // RELIABILITY-FIX: run via after(), same as animate-backfill and the
    // fal-lora webhook's own original canon-set trigger — without it,
    // Vercel is free to freeze the function the instant this response is
    // sent, before any of these actually run. Sequential (not concurrent)
    // on purpose — each entry is already a full 50-image canon run;
    // firing BATCH_SIZE of those at once would multiply fal.ai concurrency
    // and cost-spike risk for no benefit, since this is a slow-drain
    // recovery path, not a latency-sensitive one.
    after(async () => {
      for (const c of rows) {
        await runCanonImageSetForCharacter(c.id, {
          characterSlug: slugify(c.name),
          loraModelId:   c.lora_model_id as string,
          facePrompt:    c.face_prompt as string,
        });
      }
    });

    logger.info('cron:canon-backfill:complete', { submitted: rows.length });
    await heartbeatSuccess('CANON_BACKFILL');
    return NextResponse.json({ ok: true, submitted: rows.length, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:canon-backfill:failed', { error: String(err) });
    await heartbeatFail('CANON_BACKFILL');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
