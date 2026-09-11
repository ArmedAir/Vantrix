/**
 * PATCH /api/profile/settings
 * Update app-behavior settings — how the app behaves for the user, not
 * who they are.
 *
 * PROFILE / SETTINGS SPLIT: display_name, username, bio, gender, and
 * avatar_url moved out of this route to PATCH /api/profile/edit (see
 * that route's docstring and src/app/(app)/profile/edit/page.tsx).
 * What's left here is strictly app-controlled preference state:
 * mature-content gating, response language, theme, and country.
 *
 * Security:
 *   - Only whitelisted fields can be updated (no tier, tokens, role, etc.)
 *   - All text fields are length-capped and sanitized
 */
import { NextResponse }          from 'next/server';
import { getAuthedUser }         from '@/lib/auth/get-authed-user';
import { supabaseAdmin }         from '@/lib/supabase/admin';
import { z }                     from 'zod';

export const dynamic = 'force-dynamic';

const settingsSchema = z.object({
  nsfw_enabled: z.boolean().optional(),
  country:      z.string().max(2).optional(),
  // Response language — see src/lib/ai/language-engine.ts. 'auto' (default)
  // follows what the user actually types; any other value pins the
  // character's replies to that language. Kept intentionally open to any
  // 2-letter code (not a fixed enum) so language-engine.ts's LANGUAGE_NAMES
  // map can grow without a matching change here.
  preferred_language: z.union([z.literal('auto'), z.string().regex(/^[a-z]{2}$/)]).optional(),
  // Skin Engine selection — see src/components/theme/skin-provider.tsx and
  // 20260817_theme_skin_accent.sql. Kept as a fixed enum (unlike
  // preferred_language's open-ended code) since both value sets are small,
  // closed, and defined entirely in vantrix-skins.ts / vantrix-accents.ts —
  // there's no equivalent of "just add a row to LANGUAGE_NAMES" here.
  theme_skin: z.enum(['obsidian-aether', 'velvet-rouge', 'midnight-sapphire', 'monochrome']).optional(),
  theme_accent: z.enum(['champagne', 'silver', 'rose', 'violet', 'emerald', 'sapphire', 'copper']).optional(),
});

export async function PATCH(req: Request) {
  const { user } = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates = parsed.data;

  // P0-AGE-GATE-FIX: this route previously let any authenticated user set
  // nsfw_enabled=true with no server-side age check at all — the profile
  // preference alone used to be treated as sufficient by several
  // discovery/dating surfaces (see resolveNsfwDiscoveryAccess() in
  // @/lib/access/character-gate). Enforcing the age requirement at the
  // point the preference is *set*, not only at the point it's *read*,
  // means there's no window where nsfw_enabled=true exists on an
  // unverified account.
  if (updates.nsfw_enabled === true) {
    const { data: isAgeVerified, error: ageVerifiedError } = await supabaseAdmin
      .rpc('is_user_age_verified', { p_user_id: user.id });

    if (ageVerifiedError || isAgeVerified !== true) {
      return NextResponse.json(
        { error: 'Age verification required before enabling mature content.', code: 'AGE_VERIFICATION_REQUIRED' },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id,nsfw_enabled,country,preferred_language,theme_skin,theme_accent')
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
    .select('id,nsfw_enabled,country,currency,tier,tokens,daily_messages_used,daily_messages_limit,created_at,preferred_language,theme_skin,theme_accent')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({ profile: data });
}
