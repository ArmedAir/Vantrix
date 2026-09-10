import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser }             from '@/lib/auth/get-authed-user';
import { z }                         from 'zod';

/**
 * DELETE /api/conversations/[id]/messages/[messageId]
 *
 * Deletes a single message from a conversation. Used by the chat UI's
 * per-bubble delete action (message-bubble.tsx / chat-window.tsx) and by
 * the regenerate flow, which deletes an assistant reply plus the user
 * turn that produced it before resending — see chat-window.tsx's
 * handleRegenerate for why that's done as two deletes + a normal send
 * rather than any new server-side "regenerate" mode: it reuses the
 * exact, already-hardened POST /api/chat/stream persistence path instead
 * of duplicating its (considerable) insert/retry/billing logic here.
 *
 * Auth: same ownership pattern as the sibling GET route in
 * messages/route.ts — the conversation must belong to the requesting
 * user. RLS backs this up, but the explicit checks keep 404 semantics
 * consistent (a message in someone else's conversation reads as "not
 * found", never "forbidden", so it can't be used to probe for the
 * existence of other users' conversations).
 */
const paramsSchema = z.object({
  id:        z.string().uuid(),
  messageId: z.string().uuid(),
});

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; messageId: string }> },
) {
  const { supabase, user } = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = paramsSchema.safeParse(await props.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { id: conversationId, messageId } = parsed.data;

  // Ownership check — same shape as GET's.
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // .select('id') on the delete so a message that never existed (or
  // already belonged to a different conversation) surfaces as a real
  // 404 instead of a silent no-op 200 — the client's optimistic removal
  // should only be trusted once we know a row actually went away.
  const { data: deleted, error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: messageId });
}
