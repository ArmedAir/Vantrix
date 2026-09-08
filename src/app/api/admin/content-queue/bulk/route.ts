/**
 * PATCH /api/admin/content-queue/bulk — reject multiple pending_review
 * content-queue rows at once.
 *
 * Deliberately reject-ONLY. Publish and retry (see [id]/route.ts) each have
 * real per-item side effects — publish inserts into character_content with
 * per-item tier/premium/display-order choices, retry re-runs a paid
 * generation call — so bulk-executing either of those silently is a much
 * bigger blast radius than a plain status flip. Reject has no side effect
 * beyond marking the row rejected, so it's the one action safe to batch.
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

const schema = z.object({
  ids:   z.array(z.string().uuid()).min(1).max(100),
  notes: z.string().max(1000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'content.publish');

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', code: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const { ids, notes } = parsed.data;

    // Only rows currently pending_review are eligible — same invariant
    // [id]/route.ts enforces per-item, applied here via the .eq filter so
    // an accidental double-submit can't re-reject an already-decided row.
    const { data, error } = await supabaseAdmin
      .from('character_content_queue')
      .update({
        status:      'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        error:       notes ?? null,
      })
      .in('id', ids)
      .eq('status', 'pending_review')
      .select('id');

    if (error) throw error;

    const updatedIds = (data ?? []).map(r => r.id as string);

    await recordAdminAction({
      adminId:    user.id,
      action:     'moderation_queue.bulk_action',
      targetType: 'moderation_queue_bulk',
      targetId:   'character_content_queue',
      targetLabel: `Bulk reject — ${updatedIds.length} content_queue items`,
      metadata:   { notes: notes ?? null, ids: updatedIds, requestedIds: ids },
    });

    return NextResponse.json({ ok: true, updated: updatedIds.length, skipped: ids.length - updatedIds.length });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}
