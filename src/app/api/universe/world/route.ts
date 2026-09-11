/**
 * GET /api/universe/world   — universe state (season/mood/tick) + active
 *                              world events + ongoing world stories.
 *                              Backs the Universe hub page's ambient header.
 */

import { NextResponse }   from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getWorldOverview } from '@/lib/universe/world-atlas';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const overview = await getWorldOverview();
  return NextResponse.json(overview);
}, 'universe/world');
