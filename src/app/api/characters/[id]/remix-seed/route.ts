/**
 * GET /api/characters/:id/remix-seed
 *
 * Any authenticated user (not just the creator) may call this for a
 * public, active character — see canRemix() in @/lib/characters/remix
 * for the exact bar. Returns a CharacterDraft-shaped seed the Creation
 * Studio can hydrate straight into its draft state via ?remixOf=:id.
 *
 * Best-effort increments the source character's remix_count — a failure
 * there never blocks the response; the seed is the part that matters to
 * the caller.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { canRemix, buildRemixSeed, type RemixSourceCharacter } from '@/lib/characters/remix';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const REMIX_SELECT =
  'id,name,creator_id,is_public,active,age,gender,pronouns,occupation,origin,category,description,' +
  'personality,archetype,attachment_style,love_language,char_openness,char_warmth,char_adventure,char_depth,' +
  'values_list,fears,flaws,dreams,current_goal,daily_routine,backstory,scenario,family_bg,childhood_bg,' +
  'friends_list,opening_line,speech_style,speech_uses,speech_avoids,hair_color,eye_color,body_type,skin_tone,' +
  'clothing,tags';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select(REMIX_SELECT)
      .eq('id', id)
      .single();

    if (error || !character) {
      return NextResponse.json({ error: 'Character not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const source = character as unknown as RemixSourceCharacter;

    if (!canRemix(source)) {
      return NextResponse.json({
        error: 'This character is not available to remix',
        code: 'REMIX_NOT_ALLOWED',
      }, { status: 403 });
    }

    const seed = buildRemixSeed(source);

    supabaseAdmin
      .rpc('increment_character_remix_count', { p_character_id: source.id })
      .then(({ error: rpcErr }) => {
        if (rpcErr) logger.warn('remix-seed:increment-failed', { characterId: source.id, error: rpcErr.message });
      });

    return NextResponse.json({
      seed,
      sourceCharacterId: source.id,
      sourceCharacterName: source.name,
    });
  } catch (err) {
    logger.error('remix-seed GET error', errorLogFields(err));
    return NextResponse.json(toErrorBody(err), { status: 500 });
  }
}
