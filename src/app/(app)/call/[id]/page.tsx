import { notFound } from "next/navigation";
import { getChatConversation } from "@/lib/frontend/chat";
import { CallScreenClient } from "@/components/chat/call-screen-client";

/**
 * OWN-PAGE FIX: the voice call used to be a client-side modal mounted
 * over /chat/[id] (voice-call-button.tsx toggled local state). Reached
 * by navigating here instead — a real screen with its own URL, so the
 * back button, a page refresh, and a shared/bookmarked link all behave
 * the way they would for any other page, not just "however the modal
 * happened to be left."
 *
 * `id` here is a conversationId, same convention as /chat/[id] — see
 * that page's own doc on why (a character's conversation already
 * exists by the time either route is reached, created up front via
 * useEnsureConversation()). Reuses getChatConversation() unchanged, the
 * exact same data /chat/[id] loads, so there's no second source of
 * truth for "which character does this conversation belong to."
 *
 * VoiceCallScreen itself (fixed inset-0 z-50) already fully covers the
 * (app) shell's sidebar/bottom-nav chrome underneath it — same posture
 * as the chat page uses, no layout-level chrome-skipping needed here
 * either.
 */
export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const conversation = await getChatConversation(id);
  if (!conversation) notFound();

  return (
    <CallScreenClient
      conversationId={id}
      characterId={conversation.characterId}
      characterName={conversation.characterName}
      characterImage={conversation.characterImage}
    />
  );
}
