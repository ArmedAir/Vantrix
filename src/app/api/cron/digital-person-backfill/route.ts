/**
 * GET /api/cron/digital-person-backfill — Digital Person Brain Backfill
 *
 * Runs daily. Finds every character with brain_initialized = false/null and
 * runs digital-person-bootstrap.ts's initializeDigitalPerson() for each —
 * assigns writing_style/voice_profile/elevenlabs_voice_id/voicestudio_voice_id
 * and seeds baseline character_knowledge, then flips brain_initialized true.
 * See digital-person-bootstrap.ts's own header comment for what "brain
 * initialized" means and why every character is supposed to have one.
 *
 * GAP THIS CLOSES: digital-person-bootstrap.ts's own doc comment says this
 * is "REQUIRED to succeed before character creation is considered complete"
 * and that a failed bootstrap should roll back the character row — but
 * backfillDigitalPersons(), the function already built for the case where
 * that didn't happen (a legacy character predating this system, or a
 * bootstrap failure that wasn't rolled back), was never wired to anything.
 * chat/stream/route.ts does self-heal a character inline on its first real
 * message, but that only fires once a real message actually arrives — an
 * audit found 6 characters sitting at brain_initialized=false, 5 of them
 * with only empty (zero-message) conversations, so the self-heal path had
 * never actually triggered for any of them. This cron is the proactive
 * path, same shape as embedding-backfill and canon-backfill for their own
 * classes of "should have happened at creation time, verify it actually
 * did" gap.
 *
 * Entirely deterministic (keyword/preset matching, baseline knowledge
 * templates) — no LLM calls, no external API calls, safe to run on a
 * schedule indefinitely; a run with nothing to backfill is a fast no-op.
 *
 * Security: requires CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security';
import { backfillDigitalPersons } from '@/lib/ai/digital-person-bootstrap';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { heartbeatStart, heartbeatSuccess, heartbeatFail } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Matches embedding-backfill's own batch size for the same reason: bounded,
// predictable run time; a larger backlog just drains across more days.
const BATCH_SIZE = 25;

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await heartbeatStart('DIGITAL_PERSON_BACKFILL');

  try {
    const result = await backfillDigitalPersons(BATCH_SIZE);
    logger.info('cron:digital-person-backfill:complete', result);
    await heartbeatSuccess('DIGITAL_PERSON_BACKFILL');
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('cron:digital-person-backfill:failed', { error: String(err) });
    await heartbeatFail('DIGITAL_PERSON_BACKFILL');
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
