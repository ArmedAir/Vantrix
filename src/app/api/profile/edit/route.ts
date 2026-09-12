/**
 * PATCH /api/profile/edit
 * Update the user's identity/profile fields — who they are, not how the
 * app behaves for them.
 *
 * PROFILE / SETTINGS SPLIT: previously all of this lived in
 * PATCH /api/profile/settings alongside app-behavior fields
 * (nsfw_enabled, preferred_language, theme_*), and the Settings page
 * rendered both together. Split so Settings can stay strictly app-based
 * and profile editing gets its own surface (see
 * src/app/(app)/profile/edit/page.tsx and ProfileEditForm). Avatar
 * upload also saves through this route now, matching every other
 * identity field here — see avatar-upload.tsx.
 *
 * Security:
 *   - Only whitelisted identity fields can be updated (no tier, tokens,
 *     role, nsfw_enabled, preferred_language, theme, etc. — those stay
 *     on /api/profile/settings)
 *   - All text fields are length-capped and sanitized
 */
import { NextResponse }          from 'next/server';
import { getAuthedUser }         from '@/lib/auth/get-authed-user';
import { supabaseAdmin }         from '@/lib/supabase/admin';
import { isAllowedImageHost }    from '@/lib/utils';
import { z }                     from 'zod';

export const dynamic = 'force-dynamic';

const profileEditSchema = z.object({
  // SAVE-FIX (carried over from settings route): the panel sends every
  // field on every save, never just the touched one — a hard min(1)
  // here would fail the *entire* PATCH the moment a user cleared this
  // field mid-edit.
  display_name: z.string().max(50).optional(),
  bio:          z.string().max(300).optional(),
  // Empty string means "leave unchanged", not "clear it" — normalized
  // below rather than validated as a real value.
  username:     z.union([
    z.literal(''),
    z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  ]).optional(),
  // Empty string means "no answer" and is stored as-is.
  gender:       z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say', '']).optional(),
  // Avatar lives with identity, not app behavior — same host check as
  // it previously had on the settings route.
  avatar_url: z.string().url().max(500).optional(),
});

export async function PATCH(req: Request) {
  const { user } = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profileEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates = parsed.data;

  // Empty-string username means "field was blank at save time", not
  // "set my username to nothing" — drop it from the write so it's a
  // no-op for that field instead of clobbering the real username or
  // failing uniqueness checks.
  if (updates.username === '') {
    delete updates.username;
  }

  // Reject avatar URLs from hosts we don't already trust for rendering —
  // otherwise a user could point their avatar at an arbitrary external
  // URL (tracking pixel, non-image content, etc.) rather than something
  // that actually went through /api/upload's validation pipeline.
  if (updates.avatar_url) {
    try {
      const hostname = new URL(updates.avatar_url).hostname;
      if (!isAllowedImageHost(hostname)) {
        return NextResponse.json({ error: 'Avatar must be an uploaded image.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid avatar URL.' }, { status: 400 });
    }
  }

  // Username uniqueness check
  if (updates.username) {
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', updates.username)
      .neq('id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Username already taken.' }, { status: 409 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id,username,display_name,bio,avatar_url,gender')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Update failed', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function GET() {
  const { supabase, user } = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,display_name,bio,avatar_url,gender')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({ profile: data });
}
