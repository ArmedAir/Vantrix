/**
 * GET /api/universe/locations              — all world locations (atlas index)
 * GET /api/universe/locations?slug=...      — single location, full detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { getAllLocations, getLocationBySlug } from '@/lib/universe/world-atlas';
import { withErrorHandling } from '@/lib/api/with-error-handling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = new URL(req.url).searchParams.get('slug');

  if (slug) {
    const location = await getLocationBySlug(slug);
    if (!location) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ location });
  }

  const locations = await getAllLocations();
  return NextResponse.json({ locations });
}, 'universe/locations');
