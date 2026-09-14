/**
 * GET  /api/admin/social — list social_posts rows for the /admin/social
 *      review queue, with a status filter, plus per-status counts
 *      (?counts=1) for a stat-card row — same shape as
 *      /api/admin/content-queue (see that route's own comment).
 * POST /api/admin/social — admin "test connection" action: calls X's
 *      GET /2/users/me with whatever X_* credentials are currently
 *      configured, so an admin can confirm they're valid without waiting
 *      for the next scheduled post. Does not touch the queue.
 *
 * Read access (GET) only requires admin. The mutating verb (POST, i.e. the
 * connection test) requires social.publish — same "who's allowed to touch
 * this pipeline at all" reasoning as content.publish on content-queue,
 * even though a connection test itself changes nothing, since surfacing
 * whether credentials work is itself operationally sensitive information
 * scoped to the same people who can act on the queue.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { requirePermission } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields, AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAdminAction } from '@/lib/admin/audit';
import { getMe, isXClientConfigured, XApiError } from '@/lib/social/x-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOCIAL_POST_STATUSES = [
  'queued',
  'pending_review',
  'posting',
  'posted',
  'failed',
  'skipped',
] as const;
type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

const SOCIAL_SELECT =
  'id,character_id,source_post_id,status,tweet_text,media_url,x_tweet_id,triggered_by,reviewed_by,reviewed_at,error,posted_at,created_at,characters:character_id(name,image_url)';

interface SocialPostRow {
  id: string;
  character_id: string;
  source_post_id: string | null;
  status: string;
  tweet_text: string | null;
  media_url: string | null;
  x_tweet_id: string | null;
  triggered_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  error: string | null;
  posted_at: string | null;
  created_at: string;
  characters: { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null;
}

function mapRow(row: SocialPostRow) {
  const character = Array.isArray(row.characters) ? row.characters[0] : row.characters;
  return {
    id: row.id,
    character_id: row.character_id,
    character_name: character?.name ?? 'Unknown character',
    character_image_url: character?.image_url ?? null,
    source_post_id: row.source_post_id,
    status: row.status,
    tweet_text: row.tweet_text,
    media_url: row.media_url,
    x_tweet_id: row.x_tweet_id,
    triggered_by: row.triggered_by,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    error: row.error,
    posted_at: row.posted_at,
    created_at: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const params = req.nextUrl.searchParams;

    if (params.get('counts') === '1') {
      const entries = await Promise.all(
        SOCIAL_POST_STATUSES.map(async (status) => {
          const { count } = await supabaseAdmin
            .from('social_posts')
            .select('id', { count: 'exact', head: true })
            .eq('status', status);
          return [status, count ?? 0] as const;
        }),
      );
      return NextResponse.json({ counts: Object.fromEntries(entries) });
    }

    const rawStatus = params.get('status');
    const status: SocialPostStatus | null =
      rawStatus && (SOCIAL_POST_STATUSES as readonly string[]).includes(rawStatus)
        ? (rawStatus as SocialPostStatus)
        : null;

    const characterId = params.get('characterId');
    const before = params.get('before');
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 30), 1), 100);

    let query = supabaseAdmin
      .from('social_posts')
      .select(SOCIAL_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (status) query = query.eq('status', status);
    if (characterId) query = query.eq('character_id', characterId);
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Same TYPE-BOUNDARY reasoning as admin-content-queue's GET handler:
    // the `characters:character_id(...)` embed defeats the generated
    // relationship types, so this cast moves the "trust the hand-written
    // row interface" boundary to where rows first arrive.
    return NextResponse.json({ items: (page as unknown as SocialPostRow[]).map(mapRow), hasMore });
  } catch (err) {
    logger.error('Admin social GET error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'social.publish');

    if (!isXClientConfigured()) {
      return NextResponse.json(
        { error: 'X credentials not configured (X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET)', code: 'NOT_CONFIGURED' },
        { status: 409 },
      );
    }

    try {
      const me = await getMe();

      await recordAdminAction({
        adminId: user.id,
        action: 'social.connection_tested',
        targetType: 'social_post',
        targetId: 'connection-test',
        targetLabel: `@${me.username}`,
        metadata: { success: true },
      });

      return NextResponse.json({ ok: true, account: me });
    } catch (err) {
      const message = err instanceof XApiError ? err.message : 'Connection test failed';
      await recordAdminAction({
        adminId: user.id,
        action: 'social.connection_tested',
        targetType: 'social_post',
        targetId: 'connection-test',
        metadata: { success: false, error: message },
      });
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  } catch (err) {
    logger.error('Admin social POST error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
