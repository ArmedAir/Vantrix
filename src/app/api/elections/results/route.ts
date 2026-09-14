/**
 * GET /api/elections/results — recently concluded elections the requesting
 * user voted in, with the winner and whether their pick won.
 */

import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getRecentResultsForUser } from '@/lib/universe/elections';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = await getRecentResultsForUser(user.id);
  return NextResponse.json({ results });
}, 'elections/results');
