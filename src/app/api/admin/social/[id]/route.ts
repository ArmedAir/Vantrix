/**
 * PATCH /api/admin/social/[id] — staff decision on one social_posts row:
 * publish it to X right now, or reject it (status='skipped').
 *
 * Publishing is a deliberate, reviewable step by default — see the
 * social_posts migration's own comment: x_auto_publish_enabled is seeded
 * OFF, so unless an admin has explicitly turned unattended posting on,
 * every queued row sits here until a human acts on it via this route.
 * 'publish' bypasses that toggle for this one row (see
 * publishSocialPostNow's own doc comment for why that's still safe) but
 * NOT the daily post cap — same reasoning as content-queue's publish
 * action being the one deliberate step between generation and a user
 * (here, the public) actually seeing the content.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requireAdmin } from '@/lib/auth/admin';
import { requirePermission } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { toErrorBody, errorLogFields, AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAdminAction } from '@/lib/admin/audit';
import { publishSocialPostNow } from '@/lib/social/publisher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // media upload + tweet post for one row

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish') }),
  z.object({ action: z.literal('reject'), notes: z.string().max(1000).optional() }),
]);

interface SocialPostRow {
  id: string;
  character_id: string;
  status: string;
  characters: { name: string } | { name: string }[] | null;
}

async function loadItem(id: string): Promise<SocialPostRow | null> {
  const { data } = await supabaseAdmin
    .from('social_posts')
    .select('id,character_id,status,characters:character_id(name)')
    .eq('id', id)
    .maybeSingle();
  return data as unknown as SocialPostRow | null;
}

function characterName(row: SocialPostRow): string {
  const character = Array.isArray(row.characters) ? row.characters[0] : row.characters;
  return character?.name ?? 'Unknown character';
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'social.publish');

    const idCheck = z.string().uuid().safeParse(params.id);
    if (!idCheck.success) {
      return NextResponse.json({ error: 'Invalid social post id', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await loadItem(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Post not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (body.action === 'publish') {
      if (existing.status !== 'queued' && existing.status !== 'pending_review') {
        return NextResponse.json(
          { error: `Cannot publish a post in status "${existing.status}" — only queued/pending_review posts can be published.`, code: 'INVALID_STATE' },
          { status: 409 },
        );
      }

      const result = await publishSocialPostNow(params.id);
      if (!result.success) {
        return NextResponse.json({ error: result.error ?? 'Publish failed', code: 'PUBLISH_FAILED' }, { status: 502 });
      }

      await recordAdminAction({
        adminId: user.id,
        action: 'social.published',
        targetType: 'social_post',
        targetId: existing.id,
        targetLabel: characterName(existing),
      });
    } else {
      if (existing.status !== 'queued' && existing.status !== 'pending_review') {
        return NextResponse.json(
          { error: `Cannot reject a post in status "${existing.status}" — only queued/pending_review posts can be rejected.`, code: 'INVALID_STATE' },
          { status: 409 },
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('social_posts')
        .update({
          status: 'skipped',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          error: body.notes ?? null,
        })
        .eq('id', params.id);
      if (updateError) throw updateError;

      await recordAdminAction({
        adminId: user.id,
        action: 'social.rejected',
        targetType: 'social_post',
        targetId: existing.id,
        targetLabel: characterName(existing),
        metadata: { notes: body.notes ?? null },
      });
    }

    const updated = await loadItem(params.id);
    logger.info('Admin: social post reviewed', { id: params.id, action: body.action, by: user.id });

    return NextResponse.json({ item: updated ? { id: updated.id, status: updated.status } : null });
  } catch (err) {
    logger.error('Admin social PATCH error', errorLogFields(err));
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(toErrorBody(err), { status });
  }
}
