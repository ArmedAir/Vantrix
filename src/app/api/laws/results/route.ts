/**
 * GET /api/laws/results — recently resolved (passed/rejected) laws the
 * requesting user voted on.
 */

import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getRecentLawResultsForUser } from '@/lib/universe/laws';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = await getRecentLawResultsForUser(user.id);
  return NextResponse.json({ results });
}, 'laws/results');
