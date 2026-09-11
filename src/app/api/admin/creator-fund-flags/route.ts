/**
 * GET  /api/admin/creator-fund-flags — list the Creator Fund self-dealing/
 *      farming review queue
 * PATCH /api/admin/creator-fund-flags — mark a row reviewed
 *
 * Same shape as /api/admin/abuse-signals — see
 * 20270115_creator_fund_character_value_score.sql's creator_fund_flags
 * table comment. Confirming 'confirmed_farming' does NOT automatically
 * touch the character's monetization_status or the held payout row;
 * that's a deliberate separate action an admin takes (e.g. via
 * /api/admin/characters/[id]) so a queue review and an enforcement action
 * are never accidentally coupled.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requirePermission }        from '@/lib/auth/permissions';
import { requireAdmin }              from '@/lib/auth/admin';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import { toErrorBody, AppError }     from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['pending', 'reviewing', 'confirmed_farming', 'confirmed_legitimate', 'dismissed'] as const;
type CreatorFundFlagStatus = (typeof STATUS_VALUES)[number];

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const rawStatus = req.nextUrl.searchParams.get('status') ?? 'pending';
    const status: CreatorFundFlagStatus = (STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as CreatorFundFlagStatus)
      : 'pending';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);

    const { data, error } = await supabaseAdmin
      .from('creator_fund_flags')
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

const patchSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(['reviewing', 'confirmed_farming', 'confirmed_legitimate', 'dismissed']),
  notes:  z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'creator_fund.review');

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const { id, status, notes } = parsed.data;
    const { error } = await supabaseAdmin
      .from('creator_fund_flags')
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
