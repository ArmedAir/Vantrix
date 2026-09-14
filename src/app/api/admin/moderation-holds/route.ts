/**
 * GET   /api/admin/moderation-holds — list submissions held for manual
 *       review, from either of two distinct flows (see `comment_id`):
 *         - pre-publish: a hold_for_review keyword match (see
 *           keyword_watchlist.action) on character/post creation — the
 *           original request was already rejected back to the caller
 *           before any DB write happened, so comment_id is null here.
 *         - post-publish (comment_id set): async AI review on an
 *           already-live feed comment — see
 *           20260909_async_comment_moderation.sql and
 *           runAsyncCommentReview() in @/lib/moderation.
 * PATCH /api/admin/moderation-holds — approve or reject a hold
 *
 * SCOPE NOTE, pre-publish holds (comment_id null): 'approve' only records
 * the admin's decision for the audit trail — it does NOT automatically
 * re-run the original character/post creation request. That request was
 * already rejected back to the caller before any DB write (every call
 * site treats allowed:false as "block, return 422" — see e.g.
 * src/app/api/characters/route.ts). submitted_payload is stored in full
 * so a future per-surface integration (or, today, an admin manually
 * recreating the content on the user's behalf) has everything needed
 * without asking the user to retype anything.
 *
 * SCOPE NOTE, post-publish holds (comment_id set): here the decision DOES
 * take effect immediately — approve/reject is cascaded onto the live
 * character_post_comments row's moderation_status below, since the
 * comment is already published and visible; there is nothing to "re-run".
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser }         from '@/lib/auth/get-authed-user';
import { requirePermission }     from '@/lib/auth/permissions';
import { requireAdmin }          from '@/lib/auth/admin';
import { supabaseAdmin }         from '@/lib/supabase/admin';
import { toErrorBody, AppError } from '@/lib/errors';
import { recordAdminAction }     from '@/lib/admin/audit';
import { logger }                from '@/lib/logger';
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
      .select('surface, user_id, comment_id')
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

    // comment_id-linked holds (async comment review — see
    // 20260909_async_comment_moderation.sql) reference an already-published
    // row, unlike the pre-publish keyword holds this route originally
    // served. For those, the admin's decision needs to actually take
    // effect on the live comment, not just record an audit trail: approve
    // confirms/restores visibility, reject pulls it from the public thread.
    if (existing.comment_id) {
      const { error: commentError } = await supabaseAdmin
        .from('character_post_comments')
        .update({ moderation_status: status, moderated_at: new Date().toISOString() })
        .eq('id', existing.comment_id);
      if (commentError) {
        logger.error('moderation-holds: failed to cascade decision to comment', {
          holdId: id, commentId: existing.comment_id, error: commentError.message,
        });
      }
    }

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
