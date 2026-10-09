import Link from "next/link";
import { Phone } from "lucide-react";

/**
 * OWN-PAGE FIX: used to hold `open` state and mount a modal
 * (voice-call-modal.tsx) on top of the chat screen. Now a plain link to
 * the call's own route — (app)/call/[id]/page.tsx fetches the
 * character/conversation data itself (same getChatConversation() this
 * chat page already used), so this button no longer needs to carry
 * characterId/characterImage down just to hand them to a modal; the
 * conversationId in the URL is enough.
 *
 * Always visible, regardless of tier — same "show the feature, gate on
 * click" pattern the rest of this app's premium surfaces use (the Brain/
 * GiftDrawer buttons next to this one are the same posture) rather than
 * hiding the entry point entirely for free users, which would mean a
 * free user never discovers the feature exists to want it. Premium +
 * balance gating happens on the call page itself via its
 * POST /api/voice/call/start preflight.
 *
 * No "use client" — a Link needs none, so this stays a Server Component
 * like the rest of chat-header.tsx's static chrome.
 */
export function VoiceCallButton({
  conversationId,
  characterName,
}: {
  conversationId: string;
  characterName: string;
}) {
  return (
    <Link
      href={`/call/${conversationId}`}
      aria-label={`Call ${characterName}`}
      title="Voice call"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors ease-premium hover:bg-white/[0.04] hover:text-gold-400"
    >
      <Phone className="h-5 w-5" />
    </Link>
  );
}
