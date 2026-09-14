/**
 * GET /api/admin/users — search/list users for the admin Users page.
 *
 * Query params: q (username fragment, UUID, or email), tier, disabled
 * ("true" to show only disabled accounts), page, limit.
 *
 * See src/lib/admin/users.ts for why this route exists at all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { listUsers } from '@/lib/admin/users';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const sp = req.nextUrl.searchParams;
    const result = await listUsers({
      query: sp.get('q') ?? undefined,
      tier: sp.get('tier') ?? undefined,
      disabledOnly: sp.get('disabled') === 'true',
      page: sp.get('page') ? Number(sp.get('page')) : undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error('Admin users GET error', errorLogFields(err));
    const status = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
