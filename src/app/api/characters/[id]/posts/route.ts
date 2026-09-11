/**
 * POST /api/characters/:id/posts
 *
 * Every character_posts row until now came from one of the two autonomous
 * cron engines (character-feed.ts / character-social-engine.ts) — there was
 * no path for the human who owns a character to post as that character
 * themselves. This is that path.
 *
 * Gated the same way character creation itself is (requirePlan 'premium'):
 * only a premium creator can own a character, and posting-as-character is
 * a creator-only action, so it stays behind the same gate rather than
 * trusting ownership alone (a user's tier can lapse after creation).
 *
 * ELIGIBILITY FIX: also requires the character to be is_public + already
 * moderation_status='approved' — the same bar canSetVisibility enforces
 * before a character can go public at all. Every row this route inserts
 * is author_type='user' with no target_user_id, which puts it on the
 * fully-public branch of posts_public_read (see the 20260905 achievement
 * migration: that RLS policy is `target_user_id IS NULL OR target_user_id
 * = auth.uid()` — public for every row except the private, one-user
 * achievement posts this route never creates) and the shared /feed cache
 * is served unauthenticated-safe. So without this gate, a still-private
 * or not-yet-reviewed character could publish straight into the global
 * public feed before anyone ever vetted it.
 *
 * Attribution: the resulting row always has author_type = 'user' and
 * created_by = the calling user's id — never presented as autonomous
 * character output. See 20261228_character_posts_user_authorship.sql.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { requirePlan } from '@/lib/auth/plan';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkActionLimit } from '@/lib/rate-limit';
import { sanitizeField } from '@/lib/sanitize';
import { moderateCharacter } from '@/lib/moderation';
import { notifyFollowersOfNewPost } from '@/lib/notifications/post-fanout';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Same image-host allowlist concern as character creation itself — a post's
// image_url is user-supplied and must come from a trusted CDN, not an
// arbitrary third-party host.
const ALLOWED_IMAGE_HOSTS = new Set([
  'cdn.vantrix.ink',
  'images.unsplash.com',
  'storage.googleapis.com',
  'res.cloudinary.com',
]);

const postCreateSchema = z.object({
  caption:   z.string().max(2000).optional(),
  image_url: z.string().url().max(500).optional(),
  post_type: z.enum(['photo', 'text', 'teaser']).default('text'),
}).refine(
  (d) => (d.post_type === 'text' ? !!d.caption?.trim() : !!d.image_url),
  { message: 'Text posts require a caption; photo/teaser posts require an image_url.' },
).refine(
  (d) => {
    if (!d.image_url) return true;
    try { return ALLOWED_IMAGE_HOSTS.has(new URL(d.image_url).hostname); }
    catch { return false; }
  },
  { message: 'image_url must be from an approved host.' },
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: characterId } = await params;
    const { user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    // Character creation is premium-gated; posting-as-character stays behind
    // the same gate rather than trusting a snapshot from creation time, since
    // a creator's tier can lapse after the character already exists.
    await requirePlan(user.id, 'premium', 'Posting as your character');

    const { data: character, error: charErr } = await supabaseAdmin
      .from('characters')
      .select('id,name,creator_id,is_public,moderation_status')
      .eq('id', characterId)
      .single();

    if (charErr || !character) {
      return NextResponse.json({ error: 'Character not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    if (character.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only this character\u2019s creator can post as them.', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }
    // Every row this route inserts is fully public under posts_public_read
    // (see 20260905 migration — that RLS policy only restricts rows that
    // carry a target_user_id, which user-authored posts never do) and can
    // enter the shared, unauthenticated-safe /feed cache. A character
    // that's still private or hasn't cleared moderation yet has no
    // business publishing into that surface — same bar canSetVisibility
    // already requires before a character can go public at all.
    if (!character.is_public || character.moderation_status !== 'approved') {
      return NextResponse.json(
        {
          error: 'This character needs to be public and approved before it can post to the feed.',
          code: 'CHARACTER_NOT_ELIGIBLE',
        },
        { status: 403 },
      );
    }

    const actionLimit = await checkActionLimit(user.id, 'character_post_create');
    if (!actionLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many posts recently. Try again later.', retryAt: actionLimit.reset },
        { status: 429 },
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = postCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid post data', code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }
    const d = parsed.data;

    const safeCaption = d.caption ? sanitizeField(d.caption, 2000) : null;

    // Same content-policy bar as character creation itself — a user posting
    // as their character is still user-generated content on the platform.
    const modResult = await moderateCharacter({
      name: character.name,
      description: safeCaption ?? '',
    });
    if (!modResult.allowed) {
      logger.warn('Character post blocked by moderation', {
        userId: user.id, characterId, category: modResult.category,
      });
      return NextResponse.json({
        error: modResult.reason ?? 'Content not permitted on this platform.',
        code: 'MODERATION_REJECTED',
        category: modResult.category,
      }, { status: 422 });
    }

    const { data: post, error: insertErr } = await supabaseAdmin
      .from('character_posts')
      .insert({
        character_id: characterId,
        caption:      safeCaption,
        image_url:    d.image_url ?? null,
        post_type:    d.post_type,
        is_locked:    false,
        created_by:   user.id,
        author_type:  'user',
      })
      .select('id,character_id,caption,image_url,post_type,is_locked,created_by,author_type,created_at')
      .single();

    if (insertErr) throw insertErr;

    logger.info('character-posts:user-post-created', { userId: user.id, characterId });

    // FOLLOW-LOOP FIX: a user posting as their character previously had no
    // effect on anyone who follows that character — see post-fanout.ts's
    // header for why that made "follow" a dead-end action. Runs after the
    // response is sent so a slow/large follower fan-out never delays the
    // poster's own confirmation.
    after(() => {
      return notifyFollowersOfNewPost({
        characterId,
        characterName: character.name,
        postId: post.id,
        caption: safeCaption,
        excludeUserId: user.id,
      }).catch((err) => {
        logger.warn('characters:post-fanout-after-failed', { characterId, error: String(err) });
      });
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    logger.error('characters:post-create-error', errorLogFields(err));
    const body = toErrorBody(err);
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json(body, { status });
  }
}
