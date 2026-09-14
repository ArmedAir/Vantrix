/**
 * GET   /api/admin/reply-guard-flags — list replies blocked by the fast
 *       moderation blocklist (src/lib/moderation/reply-guard.ts)
 * PATCH /api/admin/reply-guard-flags — mark a row reviewed
 *
 * Same non-blocking-review pattern as crisis-events and abuse-signals: by
 * the time a row lands here, a fallback reply has already been substituted
 * and sent. Should fire extremely rarely — frequent rows indicate an
 * upstream prompt/model issue worth investigating, not the safety net
 * working as intended.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser }         from '@/lib/auth/get-authed-user';
import { requirePermission }        from '@/lib/auth/permissions';
import { requireAdmin }          from '@/lib/auth/admin';
import { supabaseAdmin }         from '@/lib/supabase/admin';
import { toErrorBody, AppError } from '@/lib/errors';
import { bulkUpdateReviewStatus } from '@/lib/admin/bulk-review';
import { recordAdminAction }     from '@/lib/admin/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['pending', 'reviewed', 'false_positive'] as const;
type ReplyGuardStatus = (typeof STATUS_VALUES)[number];

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const rawStatus = req.nextUrl.searchParams.get('status') ?? 'pending';
    const status: ReplyGuardStatus = (STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as ReplyGuardStatus)
      : 'pending';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);

    const { data, error } = await supabaseAdmin
      .from('reply_guard_flags')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ flags: data ?? [] });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}

const singlePatchSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(['reviewed', 'false_positive']),
  notes:  z.string().max(2000).optional(),
});

// Bulk variant — same status/notes shape, `ids` instead of `id`. Notes are
// applied identically to every row in the batch (there's no per-row notes
// field in a bulk request); use the single-id form for a row that needs
// its own note.
const bulkPatchSchema = z.object({
  ids:    z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['reviewed', 'false_positive']),
  notes:  z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'reply_guard.review');

    const raw = await req.json().catch(() => ({}));

    const bulk = bulkPatchSchema.safeParse(raw);
    if (bulk.success) {
      const { ids, status, notes } = bulk.data;
      const result = await bulkUpdateReviewStatus('reply_guard_flags', ids, {
        status,
        reviewer_notes: notes,
        reviewed_by:    user.id,
        reviewed_at:    new Date().toISOString(),
      });

      await recordAdminAction({
        adminId:    user.id,
        action:     'moderation_queue.bulk_action',
        targetType: 'moderation_queue_bulk',
        targetId:   'reply_guard_flags',
        targetLabel: `Bulk ${status} — ${result.updated} reply_guard_flags`,
        metadata:   { status, ids: result.ids },
      });

      return NextResponse.json({ ok: true, updated: result.updated });
    }

    const parsed = singlePatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const { id, status, notes } = parsed.data;
    const { error } = await supabaseAdmin
      .from('reply_guard_flags')
      .update({
        status,
        reviewer_notes: notes,
        reviewed_by:    user.id,
        reviewed_at:    new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}
