/**
 * /api/admin/users/[id] — single-user admin detail + mutation route.
 *
 * GET   — full profile detail (subscription, economy, verification,
 *         suspension flag) plus the 25 most recent token_ledger rows, for
 *         the /admin/users detail panel.
 * PATCH — disable/enable the account (`is_disabled`) and/or change role.
 *         Disable/enable requires `users.disable`; a role change is only
 *         reachable at all once requireAdmin has passed, i.e. only a full
 *         admin can promote/demote (matches the codebase's existing
 *         requireAdmin+requirePermission stacking convention — see
 *         api/admin/characters/[id]/route.ts).
 *
 * See src/lib/admin/users.ts for why this route didn't exist before.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { requirePermission } from '@/lib/auth/permissions';
import { getUserDetail, listTokenLedger, setUserDisabled, setUserRole } from '@/lib/admin/users';
import { recordAdminAction } from '@/lib/admin/audit';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

const patchSchema = z
  .object({
    is_disabled: z.boolean().optional(),
    role: z.enum(['user', 'moderator', 'admin']).optional(),
  })
  .refine((b) => b.is_disabled !== undefined || b.role !== undefined, {
    message: 'Provide at least one of is_disabled, role',
  });

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const idCheck = idSchema.safeParse(params.id);
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Invalid user id', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const [detail, ledger] = await Promise.all([
      getUserDetail(params.id),
      listTokenLedger(params.id),
    ]);

    return NextResponse.json({ user: detail, tokenLedger: ledger });
  } catch (err) {
    logger.error('Admin user GET error', errorLogFields(err));
    const status = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const idCheck = idSchema.safeParse(params.id);
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Invalid user id', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // A caller can never touch their own account through this route — a
    // self-disable/self-demote here would be an easy way to accidentally
    // lock the only signed-in admin out mid-session.
    if (params.id === user.id) {
      return NextResponse.json(
        { error: 'Cannot modify your own account through this route', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    let result;

    if (body.is_disabled !== undefined) {
      await requirePermission(user.id, 'users.disable');
      result = await setUserDisabled(params.id, body.is_disabled);
      await recordAdminAction({
        adminId: user.id,
        action: body.is_disabled ? 'user.disable' : 'user.enable',
        targetType: 'user',
        targetId: params.id,
        targetLabel: result.username,
      });
    }

    if (body.role !== undefined) {
      // Role changes (in particular granting `admin`) are the most
      // sensitive mutation this route exposes — deliberately gated on
      // full requireAdmin above with no separate moderator-permission
      // bypass, unlike disable/enable.
      result = await setUserRole(params.id, body.role);
      await recordAdminAction({
        adminId: user.id,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: params.id,
        targetLabel: result.username,
        metadata: { newRole: body.role },
      });
    }

    return NextResponse.json({ user: result });
  } catch (err) {
    logger.error('Admin user PATCH error', errorLogFields(err));
    const status = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
