/**
 * PATCH /api/characters/:id/dating
 * Body: { dating_enabled: boolean }
 *
 * Lets a creator flip their own character's dating-pool eligibility on or
 * off. This is the missing opt-in surface referenced in characters/route.ts's
 * ACTIVATION-FIX comment: creator-submitted characters start with
 * dating_enabled=false so a still-pending character can't be silently
 * dating-eligible the moment it's created — this route is how the creator
 * actually turns it on once ready. Enabling requires the character to have
 * already passed moderation (see canSetDatingEnabled in
 * @/lib/characters/ownership), mirroring visibility/route.ts's identical
 * public/private gate. Disabling has no such gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { canSetDatingEnabled } from '@/lib/characters/ownership';
import { toErrorBody, errorLogFields } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getAuthedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const datingEnabled: unknown = body?.dating_enabled;
    if (typeof datingEnabled !== 'boolean') {
      return NextResponse.json({ error: "dating_enabled must be a boolean", code: 'INVALID_BODY' }, { status: 400 });
    }

    const { data: character, error: fetchError } = await supabaseAdmin
      .from('characters')
      .select('id,creator_id,moderation_status,dating_enabled')
      .eq('id', id)
      .single();

    if (fetchError || !character) {
      return NextResponse.json({ error: 'Character not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const check = canSetDatingEnabled(character, user.id, datingEnabled);
    if (!check.allowed) {
      return NextResponse.json({ error: check.reason ?? 'Not allowed', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('characters')
      .update({ dating_enabled: datingEnabled })
      .eq('id', id);

    if (updateError) throw updateError;

    return NextResponse.json({ id, dating_enabled: datingEnabled });
  } catch (err) {
    logger.error('Character dating PATCH error', errorLogFields(err));
    return NextResponse.json(toErrorBody(err), { status: 500 });
  }
}
