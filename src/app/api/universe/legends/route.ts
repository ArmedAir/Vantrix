/**
 * GET /api/universe/legends   — all active legends in the universe
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getActiveLegends }          from '@/lib/universe/status-legend';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (_req: NextRequest) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const legends = await getActiveLegends();
  return NextResponse.json({ legends, max_legends: 12, count: legends.length });
}, 'universe/legends');
