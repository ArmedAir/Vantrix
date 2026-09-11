import { notFound } from "next/navigation";
import { getChatConversation, getInitialMessages } from "@/lib/frontend/chat";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatWindow } from "@/components/chat/chat-window";
import { AiDisclaimerBanner } from "@/components/chat/ai-disclaimer-banner";
import { SectionErrorBoundary } from "@/components/shell/section-error-boundary";

/**
 * §12 Phase 2 — "the core loop; get it real before anything else."
 * `id` here is a conversationId (see /api/conversations/[id]/messages and
 * /api/conversations/ensure, which both key on it the same way), not a
 * characterId — a character's conversation is created up front via
 * useEnsureConversation() from the character detail page, then this route
 * is what's actually navigated to.
 */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const conversation = await getChatConversation(id);
  if (!conversation) notFound();

  const initialMessages = await getInitialMessages(id);

  return (
    // HEIGHT-FIX: was `h-full`, which doesn't resolve reliably here — the
    // (app) layout's immersive-chat wrapper only sets `min-h-screen` on
    // this page's ancestor (see (app)/layout.tsx's isImmersiveChatRoute
    // branch), and percentage heights don't respect an ancestor's
    // min-height, only an explicit height. `h-full` was silently
    // collapsing to content height instead of the viewport, which is also
    // why ChatWindow historically avoided the same trap by anchoring to
    // the app's own `--vvh` custom property (globals.css, kept accurate
    // on mobile by viewport-height-sync.tsx) instead of any ancestor
    // percentage. Anchoring this outer column to `--vvh` directly gives
    // ChatWindow's flex-1 (see its own CHROME FIX comment) a real,
    // reliable height to size against, so it — and any number of
    // shrink-0 siblings above it, like AiDisclaimerBanner below, whatever
    // their heights turn out to be — lay out correctly without a
    // hardcoded number anywhere in the chain.
    <div className="flex h-[var(--vvh)] flex-col">
      <ChatHeader
        conversationId={conversation.id}
        characterId={conversation.characterId}
        characterName={conversation.characterName}
        characterImage={conversation.characterImage}
        isLive={conversation.isLive}
        introVideoUrl={conversation.introVideoUrl}
        galleryImageUrls={conversation.galleryImageUrls}
        galleryVideoUrls={conversation.galleryVideoUrls}
        sanctuaryMode={conversation.sanctuaryMode}
      />
      <AiDisclaimerBanner conversationId={conversation.id} />
      <SectionErrorBoundary label="Chat" context="chat/[id]">
        <ChatWindow
          conversationId={conversation.id}
          characterId={conversation.characterId}
          initialMessages={initialMessages}
        />
      </SectionErrorBoundary>
    </div>
  );
}
