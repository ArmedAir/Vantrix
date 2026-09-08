/**
 * PATCH /api/conversations/[id]
 *
 * Currently scoped to exactly one field: sanctuary_mode (see
 * 20270111_sanctuary_mode_toggle.sql). This is the write path for the
 * Sanctuary/World toggle — flipping it on skips assembleUniverseContext()
 * for every future turn in this conversation (companion-context.ts's
 * isSanctuaryMode() reads it back), giving the "isolated intimacy"
 * segment a way to opt a specific relationship out of the living world
 * without affecting any of their other conversations.
 *
 * Ownership: conversations already has a full-CRUD-own RLS policy
 * ("conversations_own" FOR ALL USING (auth.uid() = user_id)) — unlike
 * priority_memories/digital_twin_profiles, which needed a dedicated
 * policy added for their own user-control routes, this one already
 * covers UPDATE. Using the RLS-scoped `supabase` client (getAuthedUser(),
 * same as /api/conversations/ensure) rather than supabaseAdmin, so RLS
 * itself is the ownership check — an update against a conversation that
 * isn't the caller's simply matches zero rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z }                         from 'zod';
import { getAuthedUser }             from '@/lib/auth/get-authed-user';
import { logger }                    from '@/lib/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sanctuaryMode: z.boolean(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { sanctuaryMode } = parsed.data;

  const { data, error } = await supabase
    .from('conversations')
    .update({ sanctuary_mode: sanctuaryMode, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id,sanctuary_mode')
    .maybeSingle();

  if (error) {
    logger.error('conversations/[id]:patch-failed', { error: error.message, id, userId: user.id });
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
  if (!data) {
    // Matches the 404-not-403 convention getChatConversation() already
    // documents (lib/frontend/chat.ts): don't confirm to a guesser that a
    // conversation id exists at all if it isn't theirs.
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, sanctuaryMode: data.sanctuary_mode });
}
