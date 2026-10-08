"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { VoiceCallModal } from "@/components/chat/voice-call-modal";

/**
 * Always visible, regardless of tier — same "show the feature, gate on
 * click" pattern the rest of this app's premium surfaces use (the Brain/
 * GiftDrawer buttons next to this one are the same posture) rather than
 * hiding the entry point entirely for free users, which would mean a
 * free user never discovers the feature exists to want it.
 *
 * Premium + balance gating happens inside VoiceCallModal's own preflight
 * (POST /api/voice/call/start) once opened — this button just mounts it.
 */
export function VoiceCallButton({
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Call ${characterName}`}
        title="Voice call"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors ease-premium hover:bg-white/[0.04] hover:text-gold-400"
      >
        <Phone className="h-5 w-5" />
      </button>
      {open && (
        <VoiceCallModal
          conversationId={conversationId}
          characterId={characterId}
          characterName={characterName}
          characterImage={characterImage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
