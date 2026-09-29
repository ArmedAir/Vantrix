/**
 * GET /api/admin/characters — searchable, paginated character list for
 * admin tooling.
 *
 * Didn't exist before this: the only two character reads on the admin
 * side were getPendingCharacters() (moderation queue — approval-pending
 * rows only) and GET /[id] (a single character, for staff review). There
 * was no way to find an already-live/approved character at all, which is
 * exactly what picking one to re-upload a portrait for needs — see
 * CharacterMediaManager, the first consumer of this route.
 *
 * Deliberately thin: id/name/image_url + a couple of list-display fields.
 * Full character detail already has its own route (GET /[id]) for when a
 * specific one is opened.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      page: searchParams.get('page') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query params', code: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const { q, page } = parsed.data;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabaseAdmin
      .from('characters')
      .select(
        'id,name,image_url,avatar_url,is_public,is_nsfw,moderation_status,created_at,profiles:creator_id(username)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    // ILIKE on name only — a search-as-you-type box, not a full-text
    // search feature. Escape % and _ so a name containing either can't
    // widen the match unexpectedly.
    if (q) {
      const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.ilike('name', `%${escaped}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      characters: data ?? [],
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      hasMore: count != null ? to + 1 < count : false,
    });
  } catch (err) {
    logger.error('Admin character list error', errorLogFields(err));
    const status = err instanceof Error && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
