/**
 * GET   /api/admin/keyword-watch-hits — list logged keyword matches
 * PATCH /api/admin/keyword-watch-hits — mark a hit reviewed/dismissed
 *
 * Same non-blocking-review pattern as reply-guard-flags. Every row here
 * is purely observational — src/lib/moderation/keyword-watch.ts never
 * blocked or altered the message that produced it. Whatever action an
 * admin decides to take (warn a user, disable a character, escalate) is
 * done by hand, outside this system.
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

const STATUS_VALUES = ['pending', 'reviewed', 'dismissed'] as const;
type HitStatus = (typeof STATUS_VALUES)[number];

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const rawStatus = req.nextUrl.searchParams.get('status') ?? 'pending';
    const status: HitStatus = (STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as HitStatus)
      : 'pending';
    const keywordId = req.nextUrl.searchParams.get('keywordId');
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);

    let query = supabaseAdmin
      .from('keyword_watch_hits')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (keywordId) query = query.eq('keyword_id', keywordId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ hits: data ?? [] });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}

const singlePatchSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(['reviewed', 'dismissed']),
  notes:  z.string().max(2000).optional(),
});

const bulkPatchSchema = z.object({
  ids:    z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['reviewed', 'dismissed']),
  notes:  z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'abuse.review');

    const raw = await req.json().catch(() => ({}));

    const bulk = bulkPatchSchema.safeParse(raw);
    if (bulk.success) {
      const { ids, status, notes } = bulk.data;
      const result = await bulkUpdateReviewStatus('keyword_watch_hits', ids, {
        status,
        reviewer_notes: notes,
        reviewed_by:    user.id,
        reviewed_at:    new Date().toISOString(),
      });

      await recordAdminAction({
        adminId:    user.id,
        action:     'moderation_queue.bulk_action',
        targetType: 'moderation_queue_bulk',
        targetId:   'keyword_watch_hits',
        targetLabel: `Bulk ${status} — ${result.updated} keyword_watch_hits`,
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
      .from('keyword_watch_hits')
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
