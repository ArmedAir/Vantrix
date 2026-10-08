"use client";

import { useEffect, useState } from "react";
import { PhoneOff, Mic, Loader2 } from "lucide-react";
import { resolveImageSrc } from "@/lib/utils";
import { usePaywall } from "@/components/paywall/paywall-provider";
import { useVoiceCall } from "@/hooks/use-voice-call";

/**
 * Full-screen voice call UI. Premium + balance gating happens via a
 * POST /api/voice/call/start preflight before this even mounts the real
 * call state (see onOpen below) — this component assumes it's only ever
 * rendered for a call that's allowed to happen, same "gate before the
 * expensive UI mounts" posture as the rest of this app's premium
 * surfaces.
 *
 * Push-to-talk: press-and-hold the mic button to speak, release to send
 * — see use-voice-call.ts's own doc for why this isn't always-on duplex.
 */
export function VoiceCallModal({
  conversationId,
  characterId,
  characterName,
  characterImage,
  onClose,
}: {
  conversationId: string;
  characterId: string;
  characterName: string;
  characterImage: string | null;
  onClose: () => void;
}) {
  const { openPaywallForError } = usePaywall();
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);
  const [freeSecondsRemaining, setFreeSecondsRemaining] = useState<number | null>(null);

  const {
    callState, transcript, error, sttSupported, elapsedSeconds,
    startCall, endCall, startListening, stopListeningAndSend,
  } = useVoiceCall({
    conversationId,
    characterId,
    onInsufficientBalance: () => {
      openPaywallForError("CALL_LIMIT_EXCEEDED", { characterName, reasonOverride: "call" });
      onClose();
    },
  });

  // Preflight: premium + balance check before the mic is ever touched.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/call/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId }),
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          const handled = openPaywallForError(body?.code, { characterName, reasonOverride: "call" });
          if (!handled) setStartError(body?.error ?? "Couldn't start the call.");
          onClose();
          return;
        }
        setFreeSecondsRemaining(body.freeSecondsRemaining ?? null);
        setStarting(false);
        startCall();
      } catch {
        if (!cancelled) {
          setStartError("Couldn't reach the server — check your connection.");
          onClose();
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount only
  }, []);

  function handleClose() {
    endCall();
    onClose();
  }

  const minutesLeft = freeSecondsRemaining !== null ? Math.floor(freeSecondsRemaining / 60) : null;
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const ss = String(elapsedSeconds % 60).padStart(2, "0");

  if (startError) return null; // paywall or inline toast already surfaced it via onClose

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-base/98 backdrop-blur-xl px-6 py-10 animate-fade-in">
      <div className="flex flex-col items-center gap-3 mt-10">
        <div className="relative h-28 w-28 rounded-full overflow-hidden border border-border-hairline shadow-gold-glow">
          {characterImage && (
            // eslint-disable-next-line @next/next/no-img-element -- call overlay avatar, not worth a next/image round-trip for a 112px circle
            <img src={resolveImageSrc(characterImage)} alt={characterName} className="h-full w-full object-cover" />
          )}
          {(callState === "listening" || callState === "speaking") && (
            <span
              className="absolute inset-0 rounded-full ring-2 ring-gold-400 animate-pulse"
              aria-hidden
            />
          )}
        </div>
        <p className="font-display text-xl text-text-primary">{characterName}</p>
        <p className="text-sm text-text-tertiary">
          {starting ? "Connecting…" : `${mm}:${ss}`}
          {minutesLeft !== null && minutesLeft <= 3 && !starting && (
            <span className="text-gold-400"> · {minutesLeft} min left this month</span>
          )}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        {!sttSupported && (
          <p className="text-sm text-danger text-center px-4">
            Voice input isn&apos;t supported in this browser — try Chrome, Edge, or Safari.
          </p>
        )}
        {error && <p className="text-sm text-danger text-center px-4">{error}</p>}
        {transcript && callState === "listening" && (
          <p className="text-sm text-text-secondary text-center px-4 italic">&ldquo;{transcript}&rdquo;</p>
        )}
        <p className="text-xs text-text-tertiary uppercase tracking-wide">
          {starting && "Connecting"}
          {callState === "idle" && "Hold to talk"}
          {callState === "listening" && "Listening…"}
          {callState === "thinking" && `${characterName} is thinking…`}
          {callState === "speaking" && `${characterName} is speaking…`}
        </p>
      </div>

      <div className="flex items-center gap-8 mb-6">
        <button
          onMouseDown={startListening}
          onMouseUp={stopListeningAndSend}
          onTouchStart={(e) => { e.preventDefault(); startListening(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopListeningAndSend(); }}
          disabled={starting || !sttSupported || callState === "thinking" || callState === "speaking"}
          aria-label="Hold to talk"
          className={
            "h-20 w-20 rounded-full flex items-center justify-center border-2 transition-[transform,background-color,border-color] ease-premium select-none disabled:opacity-40 " +
            (callState === "listening"
              ? "bg-gold-500 border-gold-400 scale-110"
              : "bg-white/[0.04] border-border-hairline hover:border-gold-500/40")
          }
        >
          {starting || callState === "thinking" ? (
            <Loader2 className="h-7 w-7 animate-spin text-text-secondary" />
          ) : (
            <Mic className={"h-7 w-7 " + (callState === "listening" ? "text-[#160F02]" : "text-text-primary")} />
          )}
        </button>

        <button
          onClick={handleClose}
          aria-label="End call"
          className="h-14 w-14 rounded-full bg-danger/90 hover:bg-danger flex items-center justify-center transition-colors ease-premium"
        >
          <PhoneOff className="h-6 w-6 text-white" />
        </button>
      </div>
    </div>
  );
}
