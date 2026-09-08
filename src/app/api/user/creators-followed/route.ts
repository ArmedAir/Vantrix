/**
 * GET /api/user/creators-followed
 *
 * Real data source for the Home "Creators You Follow" rail (see
 * creators-you-follow.tsx) and, with a higher ?limit=, the full
 * /creators/following list page.
 *
 * CREATORS-ROUTES FIX: the actual grouping/auth/RLS query logic now lives
 * in lib/creators/followed.ts (fetchFollowedCreators) so a Server
 * Component page can call it in-process — this route is a thin HTTP
 * wrapper over that shared function for any client-side/external caller,
 * same split home-context.ts already uses elsewhere. See that file's own
 * header comment for the full data-shape rationale (follows are
 * per-character, grouped up to one row per distinct creator).
 *
 * Requires auth. Returns 200 with an empty list for unauthenticated/errored
 * calls so Home's existing `if (creators.length === 0) return null;` guard
 * (creators-you-follow.tsx) degrades the section away rather than the page
 * failing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { fetchFollowedCreators, type FollowedCreator } from '@/lib/creators/followed';

export const dynamic = 'force-dynamic';

// Hard ceiling on the ?limit= override — the homepage rail wants 12, the
// /creators/following page wants "everything reasonable"; neither should
// be able to force an unbounded query via query string.
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const { user } = await getAuthedUser();

  if (!user) {
    return NextResponse.json(
      { creators: [] as FollowedCreator[] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '12', 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 12));

  const creators = await fetchFollowedCreators(user.id, { max: limit });

  return NextResponse.json(
    { creators },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
  );
}
