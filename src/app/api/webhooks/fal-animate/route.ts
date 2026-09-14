import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyFalWebhookSignature, getFalWebhookHeaders } from '@/lib/fal/webhook-verify';
import { persistAnimatedVideoToR2 } from '@/lib/fal/animate-portrait';
import { recordMediaUsage } from '@/lib/media-budget';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic     = 'force-dynamic';

interface FalAnimateWebhookBody {
  request_id: string;
  status:     'OK' | 'ERROR';
  payload?: {
    video?: { url: string } | string; // fal's response shape varies by model — check against the live payload
  };
  error?: string;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const { requestId, userId, timestamp, signature } = getFalWebhookHeaders(req.headers);
  const verified = await verifyFalWebhookSignature(rawBody, requestId, userId, timestamp, signature);

  if (!verified) {
    logger.error('fal-animate-webhook: rejected — invalid, missing, or unverifiable signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const characterId = req.nextUrl.searchParams.get('characterId');
  if (!characterId) {
    return NextResponse.json({ error: 'missing characterId' }, { status: 400 });
  }
  // BUDGET-LEAK-FIX: only present when this job came from the manual
  // /api/characters/[id]/animate route, which is the sole call site that
  // reserves against the per-user media budget before submitting to fal
  // (see animate-portrait.ts's AnimatePortraitInput.billedUserId doc).
  // Every other trigger path (creation, admin backfill, cron backfill)
  // omits it, and this webhook must not settle/release anything for those —
  // there's no reservation to reconcile. Previously this reservation was
  // never settled or released on ANY path, permanently locking budget.
  const billedUserId = req.nextUrl.searchParams.get('billedUserId');

  let body: FalAnimateWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.request_id) {
    return NextResponse.json({ error: 'missing request_id' }, { status: 400 });
  }

  // Idempotency — same pattern as fal-lora's webhook, in case fal.ai retries delivery.
  const idempKey = `fal_animate-${body.request_id}`;
  const { data: existing } = await supabaseAdmin
    .from('processed_webhooks')
    .select('id')
    .eq('id', idempKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const { error: insertError } = await supabaseAdmin
    .from('processed_webhooks')
    .insert({ id: idempKey, provider: 'fal_animate' });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, deduped: true });
    }
    logger.error('fal-animate-webhook: failed to record idempotency key', { error: insertError.message });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }

  if (body.status === 'ERROR') {
    // Fal reported a failure at its own level — same convention as
    // chat/video/status/route.ts: a failed job typically still consumed
    // provider compute, so this settles as real spend rather than
    // releasing the reservation.
    if (billedUserId) await recordMediaUsage('video', billedUserId);
    await supabaseAdmin
      .from('characters')
      .update({
        video_status: 'failed',
        video_error:  body.error ?? 'unknown error',
      })
      .eq('id', characterId);

    return NextResponse.json({ ok: true });
  }

  // fal's response shape for the video output varies by model — this reads
  // both common shapes (nested object with .url, or a bare string). Confirm
  // the exact shape against the live payload for whichever model
  // FAL_ANIMATE_MODEL ends up being, and adjust if needed.
  const videoField = body.payload?.video;
  const falVideoUrl = typeof videoField === 'string' ? videoField : videoField?.url;

  if (!falVideoUrl) {
    logger.error('fal-animate-webhook: OK status missing video url in payload', { requestId: body.request_id });
    if (billedUserId) await recordMediaUsage('video', billedUserId);
    await supabaseAdmin
      .from('characters')
      .update({ video_status: 'failed', video_error: 'malformed payload: no video url' })
      .eq('id', characterId);
    return NextResponse.json({ error: 'malformed payload' }, { status: 400 });
  }

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .maybeSingle();

  if (!character) {
    logger.error('fal-animate-webhook: character not found', { characterId });
    // Fal already billed the generation regardless — settle, don't release.
    if (billedUserId) await recordMediaUsage('video', billedUserId);
    return NextResponse.json({ error: 'character not found' }, { status: 404 });
  }

  const upload = await persistAnimatedVideoToR2(character.id, falVideoUrl);

  if (!upload.success || !upload.r2Url) {
    logger.error('fal-animate-webhook: R2 upload failed', { error: upload.error, characterId });
    // Generation succeeded and was billed by fal even though our own R2
    // upload failed afterward — still settle as spend (same convention as
    // chat/video/status/route.ts's r2-upload-failed branch).
    if (billedUserId) await recordMediaUsage('video', billedUserId);
    await supabaseAdmin
      .from('characters')
      .update({ video_status: 'failed', video_error: upload.error ?? 'R2 upload failed' })
      .eq('id', characterId);
    return NextResponse.json({ error: 'storage failed' }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('characters')
    .update({
      video_url:         upload.r2Url,
      video_status:      'completed',
      video_error:        null,
      video_generated_at: new Date().toISOString(),
    })
    .eq('id', characterId);

  if (updateError) {
    logger.error('fal-animate-webhook: failed to update character', { error: updateError.message, characterId });
    // Generation and upload both succeeded — settle regardless of this
    // last DB write's outcome, so a transient update failure can't leave
    // the reservation stuck forever on top of the character-row problem.
    if (billedUserId) await recordMediaUsage('video', billedUserId);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }

  // Full success — settle the reservation as real spend.
  if (billedUserId) await recordMediaUsage('video', billedUserId);

  return NextResponse.json({ ok: true });
}
