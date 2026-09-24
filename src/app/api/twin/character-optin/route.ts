/**
 * GET /api/twin/character-optin?characterId=<uuid> → { twinReady, enabled }
 * PUT /api/twin/character-optin { characterId, enabled } → { ok, enabled }
 *
 * Per-character consent for "let this character get to know how you talk".
 * When ON, that ONE character's chat context receives a lightweight style
 * summary (tone / humor / formality / texting style — never the twin's beliefs,
 * contradictions or emotional patterns). No row = OFF, which is the default.
 *
 * Enabling requires the Digital Twin plan (403 PLAN_GATED), an enabled + trained
 * twin (409 TWIN_NOT_READY) and a live character (404). Disabling is always allowed —
 * even after a plan lapse — and takes effect on the very next message.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields, AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requirePlan } from '@/lib/auth/plan';
import { hasTwinPlanAccess } from '@/lib/digital-twin/plan-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema  = z.string().uuid();
const putSchema = z.object({ characterId: idSchema, enabled: z.boolean() });

/** "Ready" = the twin is switched on AND has actually been trained (there is something to share). */
async function isTwinReady(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('digital_twin_profiles')
    .select('enabled, auto_traits')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.enabled && data.auto_traits);
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const id = idSchema.safeParse(req.nextUrl.searchParams.get('characterId'));
    if (!id.success) {
      return NextResponse.json({ error: 'Invalid characterId', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const [twinEnabled, planOk, optin] = await Promise.all([
      isTwinReady(user.id),
      hasTwinPlanAccess(user.id),
      supabaseAdmin
        .from('character_twin_optins')
        .select('character_id')
        .eq('user_id', user.id)
        .eq('character_id', id.data)
        .maybeSingle(),
    ]);
    if (optin.error) throw optin.error;
    const twinReady = twinEnabled && planOk;

    return NextResponse.json({ twinReady, enabled: twinReady && Boolean(optin.data) });
  } catch (err) {
    logger.error('Twin character-optin GET error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const parsed = putSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { characterId, enabled } = parsed.data;

    if (!enabled) {
      const { error } = await supabaseAdmin
        .from('character_twin_optins')
        .delete()
        .eq('user_id', user.id)
        .eq('character_id', characterId);
      if (error) throw error;
      return NextResponse.json({ ok: true, enabled: false });
    }

    await requirePlan(user.id, 'premium', 'Digital Twin');
    if (!(await isTwinReady(user.id))) {
      return NextResponse.json(
        { error: 'Train your Digital Twin first.', code: 'TWIN_NOT_READY' },
        { status: 409 },
      );
    }

    const { data: character, error: charErr } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('id', characterId)
      .eq('active', true)
      .maybeSingle();
    if (charErr) throw charErr;
    if (!character) {
      return NextResponse.json({ error: 'Character not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('character_twin_optins')
      .upsert({ user_id: user.id, character_id: characterId }, { onConflict: 'user_id,character_id' });
    if (error) throw error;

    return NextResponse.json({ ok: true, enabled: true });
  } catch (err) {
    logger.error('Twin character-optin PUT error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
