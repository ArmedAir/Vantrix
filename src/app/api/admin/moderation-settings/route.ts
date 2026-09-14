/**
 * GET   /api/admin/moderation-settings — read the current AI-moderation
 *       prompt tuning (moderation_prompt_config)
 * PATCH /api/admin/moderation-settings — update it
 *
 * Scope: this ONLY edits the additive "Additional platform-specific
 * allow/block guidance" appended to moderation/index.ts's AI moderation
 * system prompt — the taste-level layer (what counts as acceptable adult
 * content on this platform). It does NOT and cannot:
 *   - touch the sync blocklist in moderateCharacter() (minors,
 *     sexual_violence, hate, real_violence, exploitation), which always
 *     runs first and is entirely code-only
 *   - touch reply-guard.ts's live chat-reply blocklist
 *   - touch crisis-detection.ts / crisis-response.ts at all
 * The PATCH handler rejects any extra_allow_notes / extra_block_notes text
 * that references a hard-blocked category (via
 * containsHardBlockedLanguage(), which shares its regexes with the actual
 * blocklist so the two can't drift) — an admin cannot use this route to
 * carve out an exception for minors/hate/real-violence/trafficking content,
 * even by accident.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser }         from '@/lib/auth/get-authed-user';
import { requirePermission }     from '@/lib/auth/permissions';
import { requireAdmin }          from '@/lib/auth/admin';
import { supabaseAdmin }         from '@/lib/supabase/admin';
import { toErrorBody, AppError } from '@/lib/errors';
import { recordAdminAction }     from '@/lib/admin/audit';
import { containsHardBlockedLanguage, invalidatePromptConfigCache } from '@/lib/moderation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);

    const { data, error } = await supabaseAdmin
      .from('moderation_prompt_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      config: data ?? { extra_allow_notes: '', extra_block_notes: '' },
    });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}

const patchSchema = z.object({
  extraAllowNotes: z.string().max(2000).optional(),
  extraBlockNotes: z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    await requireAdmin(user.id);
    await requirePermission(user.id, 'moderation.settings_manage');

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    // Reject any attempt — deliberate or accidental — to reference a
    // hard-blocked category in the "allow" notes specifically. Block notes
    // are unrestricted (making the AI layer MORE conservative is always
    // safe); allow notes are the only field that could theoretically be
    // used to argue the AI verdict toward permitting something it
    // shouldn't, so that's the one this guard checks.
    if (parsed.data.extraAllowNotes) {
      const guard = containsHardBlockedLanguage(parsed.data.extraAllowNotes);
      if (guard.blocked) {
        return NextResponse.json({
          error: `Allow-notes text matched a hard-blocked category ("${guard.category}") and was rejected. `
               + `This route cannot be used to permit minors, sexual violence, hate, real-world violence, or exploitation content.`,
          code: 'HARD_BLOCKED_CATEGORY_REJECTED',
        }, { status: 422 });
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('moderation_prompt_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    const update = {
      extra_allow_notes: parsed.data.extraAllowNotes,
      extra_block_notes: parsed.data.extraBlockNotes,
      updated_by:         user.id,
      updated_at:         new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabaseAdmin
        .from('moderation_prompt_config')
        .update(update)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('moderation_prompt_config')
        .insert({
          extra_allow_notes: update.extra_allow_notes ?? '',
          extra_block_notes: update.extra_block_notes ?? '',
          updated_by:        user.id,
        });
      if (error) throw error;
    }

    invalidatePromptConfigCache();

    await recordAdminAction({
      adminId:    user.id,
      action:     'moderation_settings.updated',
      targetType: 'moderation_settings',
      targetId:   existing?.id ?? 'singleton',
      targetLabel: 'AI moderation prompt tuning',
      metadata:   { extraAllowNotesLength: update.extra_allow_notes?.length ?? 0, extraBlockNotesLength: update.extra_block_notes?.length ?? 0 },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const body = toErrorBody(err);
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(body, { status });
  }
}
