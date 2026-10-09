"use client";

import { useRouter } from "next/navigation";
import { VoiceCallScreen } from "@/components/chat/voice-call-screen";

/**
 * Exists only because the call page (a Server Component, for the
 * getChatConversation data fetch) needs useRouter() for "end call ->
 * go back to the conversation," which only works in a Client Component.
 */
export function CallScreenClient({
  conversationId,
  characterId,
  characterName,
  characterImage,
}: {
  conversationId: string;
  characterId: string;
  characterName: string;
  characterImage: string | null;
}) {
  const router = useRouter();

  return (
    <VoiceCallScreen
      conversationId={conversationId}
      characterId={characterId}
      characterName={characterName}
      characterImage={characterImage}
      onClose={() => router.push(`/chat/${conversationId}`)}
    />
  );
}
