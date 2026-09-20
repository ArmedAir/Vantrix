/**
 * GET   /api/twin/personalization → { hasTwin, twinEnabled, useForMatching, mirrorCharacterIds }
 * PATCH /api/twin/personalization → { useForMatching: boolean }
 *
 * The user-level consent switch for letting their Digital Twin's humor / values /
 * tone nudge dating + "For You" ranking. Default OFF. Ranking runs in the
 * deterministic scorer only — twin data is never sent to an LLM by this path.
 *
 * Turning it ON requires the Digital Twin plan (403 PLAN_GATED) and an enabled
 * twin (409 TWIN_NOT_READY). Turning it OFF is always allowed — even after a
 * plan lapse. Either way the user's cached
 * recommendation lists are dropped so the change is visible immediately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields, AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requirePlan } from '@/lib/auth/plan';
import { hasTwinPlanAccess } from '@/lib/digital-twin/plan-access';
import { invalidateRecommendations } from '@/lib/recommendations/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({ useForMatching: z.boolean() });

export async function GET() {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const [twin, optins, planOk] = await Promise.all([
      supabaseAdmin
        .from('digital_twin_profiles')
        .select('enabled, auto_traits, use_for_matching')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('character_twin_optins')
        .select('character_id')
        .eq('user_id', user.id),
      hasTwinPlanAccess(user.id),
    ]);

    // twinEnabled folds in the plan: it is what the UI uses to decide whether to
    // offer the switch at all, and a lapsed plan must not look "ready".
    const twinEnabled = planOk && Boolean(twin.data?.enabled && twin.data.auto_traits);
    return NextResponse.json({
      hasTwin: Boolean(twin.data),
      twinEnabled,
      useForMatching: twinEnabled && Boolean(twin.data?.use_for_matching),
      mirrorCharacterIds: (optins.data ?? []).map(r => r.character_id),
    });
  } catch (err) {
    logger.error('Twin personalization GET error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { useForMatching } = parsed.data;
    if (useForMatching) await requirePlan(user.id, 'premium', 'Digital Twin');

    const { data: twin, error: readErr } = await supabaseAdmin
      .from('digital_twin_profiles')
      .select('enabled, auto_traits')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readErr) throw readErr;

    if (useForMatching && !(twin?.enabled && twin.auto_traits)) {
      return NextResponse.json(
        { error: 'Train your Digital Twin first.', code: 'TWIN_NOT_READY' },
        { status: 409 },
      );
    }
    // Turning OFF with no twin row is a no-op success (nothing to switch off).
    if (twin) {
      const { error } = await supabaseAdmin
        .from('digital_twin_profiles')
        .update({ use_for_matching: useForMatching })
        .eq('user_id', user.id);
      if (error) throw error;
      await invalidateRecommendations(user.id);
    }

    return NextResponse.json({ ok: true, useForMatching: Boolean(twin) && useForMatching });
  } catch (err) {
    logger.error('Twin personalization PATCH error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
