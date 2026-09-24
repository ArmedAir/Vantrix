/**
 * GET   /api/admin/brain — Groq brain status: enabled/configured/paused, plan +
 *       limits the governor enforces, live per-model usage (this minute / today),
 *       today's per-task outcome counters, and the 20 most recent decisions
 *       (homepage rotation etc.) so shadow-mode runs can be reviewed.
 * PATCH /api/admin/brain — { paused: boolean } — the kill switch. Paused = every
 *       brain-backed feature (curator, rotation, X ranking) immediately falls
 *       back to its deterministic path. Chat is unaffected either way.
 *
 * Admin-only (requireAdmin). The switch is a Redis flag, so it takes effect on
 * every instance within one request, with no redeploy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields, AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAdminAction } from '@/lib/admin/audit';
import { getBrainStatus, setBrainPaused } from '@/lib/ai/groq-brain';
import { env } from '@/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({ paused: z.boolean() });

export async function GET() {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const [status, decisions] = await Promise.all([
      getBrainStatus(),
      supabaseAdmin
        .from('ai_brain_decisions')
        .select('id,task,mode,applied,used_brain,model,latency_ms,input_summary,output,created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      ...status,
      homepageRotationMode: env.HOMEPAGE_ROTATION_MODE ?? 'shadow',
      recentDecisions: decisions.data ?? [],
    });
  } catch (err) {
    logger.error('Admin brain GET error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await setBrainPaused(parsed.data.paused);
    await recordAdminAction({
      adminId: user.id,
      action: 'brain.pause_toggled',
      targetType: 'ai_brain',
      targetId: 'groq',
      targetLabel: parsed.data.paused ? 'paused' : 'resumed',
      metadata: { paused: parsed.data.paused },
    });

    return NextResponse.json({ ok: true, paused: parsed.data.paused });
  } catch (err) {
    logger.error('Admin brain PATCH error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
