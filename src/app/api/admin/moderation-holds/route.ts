/**
 * GET   /api/admin/moderation-holds — list submissions held by a
 *       hold_for_review keyword match (see keyword_watchlist.action)
 * PATCH /api/admin/moderation-holds — approve or reject a hold
 *
 * IMPORTANT SCOPE NOTE: 'approve' here records the admin's decision for
 * the audit trail (status, reviewed_by, reviewed_at) — it does NOT
 * automatically re-run the original character/post/comment creation
 * request. moderateCharacter() already rejected that request back to the
 * caller before any DB write happened (every call site treats
 * allowed:false as "block, return 422" — see e.g.
 * src/app/api/characters/route.ts). submitted_payload is stored in full
 * specifically so a future per-surface integration (or, today, an admin
 * manually recreating the content on the user's behalf) has everything
 * needed without asking the user to retype anything. See this table's
 * migration comment for the full rationale.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser }         from '@/lib/auth/get-authed-user';
import { requirePermission }     from '@/lib/auth/permissions';
import { requireAdmin }          from '@/lib/auth/admin';
import { supabaseAdmin }         from '@/lib/supabase/admin';
import { toErrorBody, AppError } from '@/lib/errors';
import { recordAdminAction }     from '@/lib/admin/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['pending', 'approved', 'rejected'] as const;
type HoldStatus = (typeof STATUS_VALUES)[number];

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const rawStatus = req.nextUrl.searchParams.get('status') ?? 'pending';
    const status: HoldStatus = (STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as HoldStatus)
      : 'pending';
    const surface = req.nextUrl.searchParams.get('surface');
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);

    let query = supabaseAdmin
      .from('moderation_holds')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (surface) query = query.eq('surface', surface);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ holds: data ?? [] });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}

const patchSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
  notes:  z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'moderation.settings_manage');

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const { id, status, notes } = parsed.data;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('moderation_holds')
      .select('surface, user_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Hold not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('moderation_holds')
      .update({
        status,
        reviewer_notes: notes,
        reviewed_by:    user.id,
        reviewed_at:    new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    await recordAdminAction({
      adminId:    user.id,
      action:     status === 'approved' ? 'moderation_hold.approved' : 'moderation_hold.rejected',
      targetType: 'moderation_hold',
      targetId:   id,
      targetLabel: `${existing.surface} hold`,
      metadata:   { notes: notes ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}
