/**
 * GET /api/feed/posts/[id] — Single post lookup.
 *
 * Backs the /feed/[id] permalink page (see feed-post-card.tsx's share
 * button, which now links there instead of a dead `/feed?post=` query
 * param no page ever read) and gives a client-side caller a real way to
 * re-fetch one post — e.g. after opening a shared link — without paging
 * through the whole list feed to find it. Same auth posture as
 * GET /api/feed/posts: the feed is a signed-in surface end to end, so a
 * signed-out request gets a 401 rather than a partially-redacted post.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getFeedPostById } from '@/lib/feed/get-posts';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const post = await getFeedPostById(user.id, params.id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (err) {
    logger.error('feed:post-get-error', errorLogFields(err));
    return NextResponse.json(toErrorBody(err), { status: 500 });
  }
}
