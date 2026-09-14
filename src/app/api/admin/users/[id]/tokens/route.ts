/**
 * POST /api/admin/users/[id]/tokens — credit or debit a user's Vantrix
 * Coin balance as an admin.
 *
 * Routes through add_tokens()/deduct_tokens() (see
 * supabase/migrations/20261212_token_ledger.sql) with
 * reason='admin_adjustment', so the change lands in token_ledger and is
 * traceable to the acting admin — not a raw balance UPDATE. Requires
 * `users.tokens_adjust`, the permission that has existed in
 * src/lib/auth/permissions.ts since the permission system was built but
 * had no route ever checking it until this one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { requirePermission } from '@/lib/auth/permissions';
import { adjustUserTokens } from '@/lib/admin/users';
import { recordAdminAction } from '@/lib/admin/audit';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

const bodySchema = z.object({
  amount: z.number().int().refine((n) => n !== 0, 'amount must be non-zero').refine(
    (n) => Math.abs(n) <= 1_000_000,
    'amount magnitude too large — check for a typo',
  ),
  note: z.string().max(200).optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'users.tokens_adjust');

    const idCheck = idSchema.safeParse(params.id);
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Invalid user id', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { balance } = await adjustUserTokens(params.id, parsed.data.amount, user.id, parsed.data.note);

    await recordAdminAction({
      adminId: user.id,
      action: 'user.tokens_adjusted',
      targetType: 'user',
      targetId: params.id,
      metadata: { amount: parsed.data.amount, note: parsed.data.note ?? null, newBalance: balance },
    });

    return NextResponse.json({ balance });
  } catch (err) {
    logger.error('Admin user tokens POST error', errorLogFields(err));
    const status = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
