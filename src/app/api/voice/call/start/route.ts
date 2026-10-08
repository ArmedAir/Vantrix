/**
 * POST /api/voice/call/start — preflight check before the client opens a
 * voice call with a character.
 *
 * Does NOT itself generate anything or deduct usage — a call's actual
 * turns go through the existing /api/chat/stream (reply generation,
 * full memory/personality/continuity — nothing duplicated or
 * reimplemented here) and existing /api/voice/tts (speech synthesis,
 * per-character voice). This route only answers "can a call start right
 * now" — premium-gated, and rejected up front if the user has zero free
 * minutes left AND can't afford a single overage minute, rather than
 * letting them start talking and finding out mid-sentence.
 *
 * Usage itself is recorded by POST /api/voice/call/usage, called
 * periodically by the client while the call is active — see that
 * route's own doc for why.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser }   from '@/lib/auth/get-authed-user';
import { requirePlan }     from '@/lib/auth/plan';
import { PlanGateError, UnauthorizedError } from '@/lib/errors';
import { checkMatureContentAccess } from '@/lib/access/character-gate';
import type { Tier } from '@/lib/rate-limit';
import { supabaseAdmin }   from '@/lib/supabase/admin';
import { logger }          from '@/lib/logger';
import {
  getCallBalance, FREE_MINUTES_PER_MONTH, OVERAGE_TOKENS_PER_MINUTE,
} from '@/lib/voice/call-limits';

export const dynamic = 'force-dynamic';

const schema = z.object({ characterId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const { characterId } = parsed.data;

    const profile = await requirePlan(user.id, 'premium', 'Voice calling');

    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, is_nsfw')
      .eq('id', characterId)
      .eq('active', true)
      .maybeSingle();
    if (!character) {
      return NextResponse.json({ error: 'Character not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Same mature-content gate text chat already goes through — a call is
    // still a conversation with this character, so it inherits the same
    // access rule rather than having its own separate (and potentially
    // looser) check.
    const gate = await checkMatureContentAccess(user.id, character.is_nsfw === true, profile.tier as Tier);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason ?? 'Not available', code: 'MATURE_GATE' }, { status: 403 });
    }

    const { data: wallet } = await supabaseAdmin
      .from('profiles').select('tokens').eq('id', user.id).single();
    const tokens = wallet?.tokens ?? 0;

    const balance = await getCallBalance(user.id);
    const canAffordOneOverageMinute = tokens >= OVERAGE_TOKENS_PER_MINUTE;
    if (balance.freeSecondsRemaining <= 0 && !canAffordOneOverageMinute) {
      return NextResponse.json({
        error: `You're out of call minutes this month and don't have enough VC for overage (${OVERAGE_TOKENS_PER_MINUTE}/min).`,
        code: 'CALL_LIMIT_EXCEEDED',
        freeMinutesPerMonth: FREE_MINUTES_PER_MONTH,
        overageTokensPerMinute: OVERAGE_TOKENS_PER_MINUTE,
      }, { status: 402 });
    }

    return NextResponse.json({
      ok: true,
      freeSecondsRemaining: balance.freeSecondsRemaining,
      tokens,
      overageTokensPerMinute: OVERAGE_TOKENS_PER_MINUTE,
    });
  } catch (err) {
    if (err instanceof PlanGateError) {
      // Real code — matches ERROR_CODE_TO_UPGRADE_REASON's PLAN_GATED key
      // (tiers/config.ts) so openPaywallForError resolves this correctly;
      // the client additionally passes reasonOverride: 'call' since that
      // map's PLAN_GATED default (lora copy) is wrong for this call site
      // — see that map's own note on why a shared code can't disambiguate
      // which requirePlan() call site it came from.
      return NextResponse.json({ error: err.message, code: 'PLAN_GATED', upgrade: true }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message, code: 'UNAUTHORIZED' }, { status: 401 });
    }
    logger.error('voice/call/start: unexpected error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Could not start call' }, { status: 500 });
  }
}
